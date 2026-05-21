"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ReportShell } from "@/components/admin/reports/report-shell";
import { useColumnPicker } from "@/components/admin/reports/column-picker";
import { useReportDateRange } from "@/lib/reports/use-report-date-range";
import {
  eachDay,
  eachMonth,
  dayCount,
} from "@/lib/reports/date-range";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { DateRange, ReportColumn } from "@/lib/reports/types";

type BankAccount = {
  id: string;
  name: string;
  type: "cash" | "bank";
  opening_balance: number;
  opening_balance_date: string;
  is_active: boolean;
};

type Movement = {
  id: string;
  date: string;
  amount: number;
  bank_account_id: string | null;
};

type Row = {
  date: string;
  label: string;
  opening: number;
  income: number;
  expenses: number;
  netChange: number;
  closing: number;
};

type Granularity = "daily" | "monthly" | "single";

/**
 * Build a date-keyed delta map for one movement stream, filtered by the
 * active bank set. The naive opening-on-D calculation (loop all
 * movements for each day in the range) is O(N × D); a 30-day range over
 * 30k payments + 30k expenses = ~1.8M iterations on first render and
 * again on every filter tweak. Pre-aggregating once is O(N), and the
 * row builder then walks the date axis in O(D) using a running balance.
 */
function buildDeltaMap(
  movements: Movement[],
  bankIds: Set<string> | null,
  includesNullAsCash: boolean,
): Map<string, number> {
  // NULL bank_account_id rows are treated as cash (pre-multi-bank legacy data).
  // When the active filter is "all", "cash", or a specific cash-type bank,
  // NULL rows are included. When filter points at a non-cash bank, NULL
  // rows are excluded (they belong to cash, not to a specific bank).
  const out = new Map<string, number>();
  for (const m of movements) {
    if (bankIds) {
      if (m.bank_account_id == null) {
        if (!includesNullAsCash) continue;
      } else if (!bankIds.has(m.bank_account_id)) {
        continue;
      }
    }
    out.set(m.date, (out.get(m.date) ?? 0) + m.amount);
  }
  return out;
}

/**
 * Static base = sum of bank opening_balances whose opening_date <= D,
 * scoped by the bank filter. Banks with opening_date > D haven't been
 * seeded yet on that date and must NOT contribute to opening. Since the
 * set is tiny (one row per bank account, usually < 5) we walk it
 * per-date — that cost is negligible compared to the movement scan.
 *
 * NOTE: As of the Opening Balance feature, the canonical society-wide
 * opening lives on bms_buildings.opening_balance (managed once via
 * Settings → Opening Balance). Per-bank opening_balance values are
 * locked to 0 by the bank-accounts server actions and a one-time
 * normalization migration. This function therefore returns 0 in
 * practice today — it's retained as a defensive zero-sum so the math
 * stays correct if a future schema change re-enables per-bank seeds.
 */
function bankBaseOn(
  date: string,
  banks: BankAccount[],
  bankIds: Set<string> | null,
): number {
  let base = 0;
  for (const b of banks) {
    if (bankIds && !bankIds.has(b.id)) continue;
    if (b.opening_balance_date <= date) base += b.opening_balance;
  }
  return base;
}

export function CashPositionClient({
  buildingName,
  initialDateRange,
  buildingOpening,
  buildingOpeningDate,
  bankAccounts,
  payments,
  expenses,
}: {
  buildingName: string;
  initialDateRange: DateRange;
  // Building-level onboarding seed — total cash + bank the society had
  // when they started using Pulse. Folded into the running balance ONLY
  // when the bank filter is "All combined"; per-bank and cash-only views
  // already track each account's own opening, so adding the building
  // figure on top would double-count.
  buildingOpening: number;
  buildingOpeningDate: string;
  bankAccounts: BankAccount[];
  payments: Movement[];
  expenses: Movement[];
}) {
  // URL-driven range: server page already trims movements to <= to.
  const [dateRange, setDateRange] = useReportDateRange(initialDateRange);
  // bank filter: "all" (combined) | "cash" (cash drawers only) | bank account uuid
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [granularityPref, setGranularityPref] = useState<
    "auto" | "daily" | "monthly" | "single"
  >("auto");

  // Decide granularity. "auto" picks daily for ≤31 days, monthly otherwise.
  // "single" collapses to one row covering the whole range — the user can
  // force this to see a one-line summary.
  const granularity: Granularity = useMemo(() => {
    if (granularityPref === "daily") return "daily";
    if (granularityPref === "monthly") return "monthly";
    if (granularityPref === "single") return "single";
    return dayCount(dateRange.from, dateRange.to) <= 31 ? "daily" : "monthly";
  }, [granularityPref, dateRange]);

  // Build the set of bank ids the filter resolves to.
  const bankIds: Set<string> | null = useMemo(() => {
    if (bankFilter === "all") return null; // no filter
    if (bankFilter === "cash") {
      return new Set(
        bankAccounts.filter((b) => b.type === "cash").map((b) => b.id),
      );
    }
    return new Set([bankFilter]);
  }, [bankFilter, bankAccounts]);

  // NULL bank_account_id rows are treated as cash (pre-multi-bank legacy data).
  // Cash-y filters ("all", "cash", or any cash-type bank) include them;
  // a specific non-cash bank filter excludes them.
  const includesNullAsCash = useMemo(() => {
    if (bankFilter === "all") return true;
    if (bankFilter === "cash") return true;
    return bankAccounts.find((b) => b.id === bankFilter)?.type === "cash";
  }, [bankFilter, bankAccounts]);

  // O(N) aggregation, recomputed only when the underlying stream or
  // bank filter changes. Each map stores `date → sum(amount that day)`.
  const incomeByDate = useMemo(
    () => buildDeltaMap(payments, bankIds, includesNullAsCash),
    [payments, bankIds, includesNullAsCash],
  );
  const expenseByDate = useMemo(
    () => buildDeltaMap(expenses, bankIds, includesNullAsCash),
    [expenses, bankIds, includesNullAsCash],
  );

  // Building-level opening only contributes to the "All combined" view —
  // per-bank and Cash-only views already track each account's own
  // opening_balance, so adding the building figure on top would
  // double-count cash that's already in some bank.
  const buildingOpeningActive = bankFilter === "all";

  const rows: Row[] = useMemo(() => {
    // Opening balance on dateRange.from = bankBaseOn(from) + sum of
    // movement deltas strictly before `from`. We compute this once per
    // render then ROLL FORWARD day-by-day — O(N + D) total instead of
    // O(N × D). Note: bankBaseOn(from) is correct for the opening row
    // because all bank seeds with date <= from are already counted; for
    // any later day in the range, banks seeded mid-range are absorbed
    // into that day's income delta via the seed-as-of-D check below.
    const baseOpening =
      bankBaseOn(dateRange.from, bankAccounts, bankIds) +
      // Building seed counts in the opening only when its as-of date is
      // already in the past relative to the visible window. Mid-range
      // seeds are added to seedByDate below so they appear as that
      // day's income, not as part of the period opening.
      (buildingOpeningActive && buildingOpeningDate <= dateRange.from
        ? buildingOpening
        : 0) +
      (() => {
        // sum of deltas strictly before `from`
        let s = 0;
        for (const [d, v] of incomeByDate) if (d < dateRange.from) s += v;
        for (const [d, v] of expenseByDate) if (d < dateRange.from) s -= v;
        return s;
      })();

    if (granularity === "single") {
      let income = 0;
      let exp = 0;
      for (const [d, v] of incomeByDate)
        if (d >= dateRange.from && d <= dateRange.to) income += v;
      for (const [d, v] of expenseByDate)
        if (d >= dateRange.from && d <= dateRange.to) exp += v;
      // Bank seeds that activate WITHIN the range count as income on
      // their seed date (admins backdating cash on hand).
      let seedDelta = 0;
      for (const b of bankAccounts) {
        if (bankIds && !bankIds.has(b.id)) continue;
        if (
          b.opening_balance_date > dateRange.from &&
          b.opening_balance_date <= dateRange.to
        ) {
          seedDelta += b.opening_balance;
        }
      }
      // Building seed activates inside the visible range too — same
      // treatment as a bank seed (one-time income on its as-of date).
      if (
        buildingOpeningActive &&
        buildingOpeningDate > dateRange.from &&
        buildingOpeningDate <= dateRange.to
      ) {
        seedDelta += buildingOpening;
      }
      const closing = baseOpening + income + seedDelta - exp;
      return [
        {
          date: dateRange.from,
          label: `${formatDate(dateRange.from)} – ${formatDate(dateRange.to)}`,
          opening: baseOpening,
          income: income + seedDelta,
          expenses: exp,
          netChange: income + seedDelta - exp,
          closing,
        },
      ];
    }

    // Per-day seed contributions keyed by ISO date.
    const seedByDate = new Map<string, number>();
    for (const b of bankAccounts) {
      if (bankIds && !bankIds.has(b.id)) continue;
      if (
        b.opening_balance_date > dateRange.from &&
        b.opening_balance_date <= dateRange.to
      ) {
        seedByDate.set(
          b.opening_balance_date,
          (seedByDate.get(b.opening_balance_date) ?? 0) + b.opening_balance,
        );
      }
    }
    // Building seed within the visible range — same treatment as a
    // bank seed: appears as income on its as-of date.
    if (
      buildingOpeningActive &&
      buildingOpeningDate > dateRange.from &&
      buildingOpeningDate <= dateRange.to
    ) {
      seedByDate.set(
        buildingOpeningDate,
        (seedByDate.get(buildingOpeningDate) ?? 0) + buildingOpening,
      );
    }

    if (granularity === "monthly") {
      const months = eachMonth(dateRange.from, dateRange.to);
      let running = baseOpening;
      return months.map((m) => {
        const opening = running;
        let income = 0;
        let exp = 0;
        let seed = 0;
        for (const [d, v] of incomeByDate)
          if (d >= m.from && d <= m.to) income += v;
        for (const [d, v] of expenseByDate)
          if (d >= m.from && d <= m.to) exp += v;
        for (const [d, v] of seedByDate)
          if (d >= m.from && d <= m.to) seed += v;
        const closing = opening + income + seed - exp;
        running = closing;
        return {
          date: m.from,
          label: m.label,
          opening,
          income: income + seed,
          expenses: exp,
          netChange: income + seed - exp,
          closing,
        };
      });
    }

    // Daily breakdown — running balance walked O(D) over the date axis.
    const days = eachDay(dateRange.from, dateRange.to);
    let running = baseOpening;
    return days.map((d) => {
      const opening = running;
      const income = incomeByDate.get(d) ?? 0;
      const exp = expenseByDate.get(d) ?? 0;
      const seed = seedByDate.get(d) ?? 0;
      const closing = opening + income + seed - exp;
      running = closing;
      return {
        date: d,
        label: formatDate(d),
        opening,
        income: income + seed,
        expenses: exp,
        netChange: income + seed - exp,
        closing,
      };
    });
  }, [
    granularity,
    dateRange,
    bankAccounts,
    bankIds,
    incomeByDate,
    expenseByDate,
    buildingOpeningActive,
    buildingOpening,
    buildingOpeningDate,
  ]);

  const columns: ReportColumn<Row>[] = useMemo(
    () => [
      {
        id: "date",
        label: granularity === "monthly" ? "Month" : "Date",
        defaultOn: true,
        accessor: (r) => r.label,
      },
      {
        id: "opening",
        label: "Opening balance",
        defaultOn: true,
        numeric: true,
        accessor: (r) => r.opening,
      },
      {
        id: "income",
        label: "Income",
        defaultOn: true,
        numeric: true,
        accessor: (r) => r.income,
      },
      {
        id: "expenses",
        label: "Expenses",
        defaultOn: true,
        numeric: true,
        accessor: (r) => r.expenses,
      },
      {
        id: "net",
        label: "Net change",
        defaultOn: true,
        numeric: true,
        accessor: (r) => r.netChange,
      },
      {
        id: "closing",
        label: "Closing balance",
        defaultOn: true,
        numeric: true,
        accessor: (r) => r.closing,
      },
    ],
    [granularity],
  );

  const { enabledIds, visibleColumns, setColumn } = useColumnPicker(
    "cash-position",
    columns,
  );

  const bankFilterLabel = useMemo(() => {
    if (bankFilter === "all") return "All combined";
    if (bankFilter === "cash") return "Cash only";
    const b = bankAccounts.find((x) => x.id === bankFilter);
    return b ? b.name : "Unknown";
  }, [bankFilter, bankAccounts]);

  const extraFilters = (
    <>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Bank
        </Label>
        <Select value={bankFilter} onValueChange={setBankFilter}>
          <SelectTrigger className="min-w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All combined</SelectItem>
            <SelectItem value="cash">Cash only</SelectItem>
            {bankAccounts
              .filter((b) => b.is_active)
              .map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} {b.type === "cash" ? "(Cash)" : "(Bank)"}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Breakdown
        </Label>
        <Select
          value={granularityPref}
          onValueChange={(v) =>
            setGranularityPref(v as "auto" | "daily" | "monthly" | "single")
          }
        >
          <SelectTrigger className="min-w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="single">Single line</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );

  const filtersLine = `Bank: ${bankFilterLabel} · Breakdown: ${granularity}`;

  // Inline annotation: when the building's onboarding opening is folded
  // into the first row, surface it so the auditor knows where the
  // initial number came from. Skipped on per-bank / cash-only filters
  // because the building opening doesn't apply there.
  const showBuildingOpeningNote =
    buildingOpeningActive && buildingOpening > 0;
  const buildingOpeningNote = showBuildingOpeningNote
    ? buildingOpeningDate <= dateRange.from
      ? `↳ includes opening balance of ${formatCurrency(buildingOpening)} from ${formatDate(buildingOpeningDate)}`
      : buildingOpeningDate <= dateRange.to
        ? `↳ opening balance of ${formatCurrency(buildingOpening)} seeded on ${formatDate(buildingOpeningDate)}`
        : null
    : null;

  return (
    <div className="space-y-2">
      <ReportShell
        title="Cash Book"
        subtitle="Opening / income / expense / closing — daily, monthly or one line."
        buildingName={buildingName}
        reportName="cash-position"
        filename={`cash-position_${buildingName.replace(/\s+/g, "_")}`}
        dateRange={dateRange}
        setDateRange={setDateRange}
        extraFilters={extraFilters}
        filtersLine={filtersLine}
        columns={columns}
        visibleColumns={visibleColumns}
        enabledIds={enabledIds}
        setColumn={setColumn}
        rows={rows}
        // Totals row in Cash Position would double-count income/expense
        // across rows (closing already encodes the running balance), so
        // we suppress it. The PDF/CSV exporters honour this flag.
        showTotals={false}
        emptyText="No movements in this period."
      />
      {buildingOpeningNote && (
        <p className="text-xs text-muted-foreground pl-1">
          {buildingOpeningNote}
        </p>
      )}
    </div>
  );
}
