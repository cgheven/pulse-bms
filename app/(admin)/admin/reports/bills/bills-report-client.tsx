"use client";

import Link from "next/link";
import { useMemo, useState, useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReportShell } from "@/components/admin/reports/report-shell";
import { useColumnPicker } from "@/components/admin/reports/column-picker";
import { useReportDateRange } from "@/lib/reports/use-report-date-range";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  providerCategoryFor,
  providerLabelFor,
  UNITS_LABEL,
  type ProviderCategory,
} from "@/lib/bill-providers";
import type { DateRange, ReportColumn } from "@/lib/reports/types";

type BillRow = {
  id: string;
  expense_date: string;
  subcategory: string;
  category: string;
  description: string;
  vendor: string;
  amount: number;
  bank_account_id: string | null;
  bill_account_id: string | null;
  units_consumed: number | null;
  due_date: string | null;
  recurrence: "monthly" | "quarterly" | "yearly" | null;
};

type BankAccount = { id: string; name: string; type: "cash" | "bank" };

type BillAccount = {
  id: string;
  nickname: string;
  provider: string;
  provider_label: string | null;
  is_active: boolean;
};

// Subcategory → friendly bill type. Falls back to the slug when unknown
// so admin-typed custom types still render.
const BILL_TYPE_LABELS: Record<string, string> = {
  corridor_electricity: "Electricity (K-Electric)",
  electricity_corridor: "Electricity (K-Electric)",
  gas: "Gas (SSGC)",
  water_supply: "Water supply",
  water_motor: "Water motor",
  internet: "Internet / Wi-Fi",
  lift_service: "Lift AMC",
  generator_diesel: "Generator diesel",
  generator_oil: "Generator oil",
};

function billTypeLabel(s: string): string {
  if (BILL_TYPE_LABELS[s]) return BILL_TYPE_LABELS[s];
  if (!s) return "—";
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function voucherNo(id: string): string {
  return "BILL-" + id.slice(0, 8).toUpperCase();
}

function periodLabel(row: BillRow): string {
  if (!row.recurrence) return formatDate(row.expense_date);
  const d = new Date(row.expense_date + "T00:00:00");
  if (row.recurrence === "monthly") {
    return d.toLocaleDateString("en-PK", { month: "long", year: "numeric" });
  }
  if (row.recurrence === "quarterly") {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `Q${q} ${d.getFullYear()}`;
  }
  return String(d.getFullYear());
}

const NUM_FMT = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

function formatUnits(n: number): string {
  return NUM_FMT.format(n);
}

// Days between two YYYY-MM-DD dates. Positive = `b` is later than `a`.
function daysBetween(a: string, b: string): number {
  const ms = new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}

type PaymentStatus = "on_time" | "late" | "no_due";

function paymentStatus(row: { expense_date: string; due_date: string | null }): {
  status: PaymentStatus;
  daysLate: number;
} {
  if (!row.due_date) return { status: "no_due", daysLate: 0 };
  const late = daysBetween(row.due_date, row.expense_date);
  if (late > 0) return { status: "late", daysLate: late };
  return { status: "on_time", daysLate: 0 };
}

function statusLabel(s: { status: PaymentStatus; daysLate: number }): string {
  if (s.status === "no_due") return "—";
  if (s.status === "on_time") return "On time";
  return s.daysLate === 1 ? "Late 1 day" : `Late ${s.daysLate} days`;
}

// Categories the user can filter by. Order mirrors CATEGORY_ORDER so
// the dropdown matches how bill accounts are grouped elsewhere.
const CATEGORY_FILTER_OPTIONS: ProviderCategory[] = CATEGORY_ORDER;

export function BillsReportClient({
  buildingName,
  initialDateRange,
  openingBalance,
  initialBillAccountId,
  initialCategory,
  initialWithUnits,
  initialVendor,
  initialOverdueOnly,
  rows,
  bankAccounts,
  billAccounts,
}: {
  buildingName: string;
  initialDateRange: DateRange;
  openingBalance: number;
  initialBillAccountId: string | null;
  initialCategory: string | null;
  initialWithUnits: boolean;
  initialVendor: string;
  initialOverdueOnly: boolean;
  rows: BillRow[];
  bankAccounts: BankAccount[];
  billAccounts: BillAccount[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  // dateRange is URL-driven (?from=&to=) so the RSC parent can refetch
  // with server-side date bounds rather than pulling every bill row.
  const [dateRange, setDateRangeRaw] = useReportDateRange(initialDateRange);
  // vendor + onlyWithUnits are URL-persisted (with_units=1, vendor=…) so
  // a copy-pasted bills URL reproduces the same filtered view and the
  // CSV/PDF exports match what's on screen. Initial state is seeded from
  // the parent server component which reads searchParams.
  const [vendorQuery, setVendorQuery] = useState(initialVendor);
  const [onlyWithUnits, setOnlyWithUnits] = useState(initialWithUnits);
  const [overdueOnly, setOverdueOnly] = useState(initialOverdueOnly);

  // Normalise the category filter to a known ProviderCategory or null.
  const activeCategory: ProviderCategory | null = useMemo(() => {
    if (!initialCategory) return null;
    return (
      (CATEGORY_FILTER_OPTIONS.find((c) => c === initialCategory) as
        | ProviderCategory
        | undefined) ?? null
    );
  }, [initialCategory]);

  // Single URL writer — wraps every filter setter so we never drop a
  // sibling param when the user changes one filter. Mirrors the pattern
  // used elsewhere in the reports module. Each override accepts an
  // explicit value (`null` / "" to clear) or `undefined` to fall back to
  // the current value — that's the sibling-param-safe contract.
  const pushParams = useCallback(
    (overrides: {
      from?: string;
      to?: string;
      bill_account_id?: string | null;
      category?: string | null;
      with_units?: boolean;
      vendor?: string;
      overdue?: boolean;
    }) => {
      const sp = new URLSearchParams();
      sp.set("from", overrides.from ?? dateRange.from);
      sp.set("to", overrides.to ?? dateRange.to);
      const billId =
        overrides.bill_account_id !== undefined
          ? overrides.bill_account_id
          : initialBillAccountId;
      if (billId) sp.set("bill_account_id", billId);
      const cat =
        overrides.category !== undefined
          ? overrides.category
          : activeCategory;
      if (cat) sp.set("category", cat);
      // with_units → "1" when on, omitted when off. Matches how the
      // server reads sp.with_units === "1".
      const withUnits =
        overrides.with_units !== undefined
          ? overrides.with_units
          : onlyWithUnits;
      if (withUnits) sp.set("with_units", "1");
      // vendor → urlencoded by URLSearchParams. Omit when empty so the
      // URL stays clean. Trim to match the server-side normalisation.
      const vendor =
        overrides.vendor !== undefined ? overrides.vendor : vendorQuery;
      const vendorTrim = vendor.trim();
      if (vendorTrim) sp.set("vendor", vendorTrim);
      // overdue → "1" when on, omitted otherwise. Matches sp.overdue === "1"
      // server-side.
      const overdue =
        overrides.overdue !== undefined ? overrides.overdue : overdueOnly;
      if (overdue) sp.set("overdue", "1");
      router.push(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [
      pathname,
      router,
      dateRange.from,
      dateRange.to,
      initialBillAccountId,
      activeCategory,
      onlyWithUnits,
      vendorQuery,
      overdueOnly,
    ],
  );

  // Wrap setDateRange so active filters survive date-range presets.
  // useReportDateRange overwrites all params with ?from=&to=; without
  // this wrap the bill_account_id + category + with_units + vendor would
  // silently disappear.
  const setDateRange = useCallback(
    (next: DateRange) => {
      setDateRangeRaw(next);
      if (
        initialBillAccountId ||
        activeCategory ||
        onlyWithUnits ||
        vendorQuery.trim() ||
        overdueOnly
      ) {
        pushParams({ from: next.from, to: next.to });
      }
    },
    [
      setDateRangeRaw,
      initialBillAccountId,
      activeCategory,
      onlyWithUnits,
      vendorQuery,
      overdueOnly,
      pushParams,
    ],
  );

  const setBillAccountFilter = useCallback(
    (id: string | null) => {
      pushParams({ bill_account_id: id });
    },
    [pushParams],
  );

  const setCategoryFilter = useCallback(
    (cat: ProviderCategory | null) => {
      pushParams({ category: cat });
    },
    [pushParams],
  );

  // Toggle the "show only with units" checkbox AND mirror it into the URL
  // so the export reflects the on-screen filter and shared links restore
  // the same view.
  const setOnlyWithUnitsUrl = useCallback(
    (next: boolean) => {
      setOnlyWithUnits(next);
      pushParams({ with_units: next });
    },
    [pushParams],
  );

  // Mirror the overdue toggle into the URL so the filter survives
  // refresh + the CSV/PDF export reflects what's on screen.
  const setOverdueOnlyUrl = useCallback(
    (next: boolean) => {
      setOverdueOnly(next);
      pushParams({ overdue: next });
    },
    [pushParams],
  );

  // Debounce vendor → URL writes so we don't spam history on every
  // keystroke. 350ms feels responsive in testing and stays out of the
  // way of CPU on slower devices.
  useEffect(() => {
    if (vendorQuery === initialVendor) return;
    const t = setTimeout(() => {
      pushParams({ vendor: vendorQuery });
    }, 350);
    return () => clearTimeout(t);
  }, [vendorQuery, initialVendor, pushParams]);

  const bankMap = useMemo(() => {
    const m = new Map<string, BankAccount>();
    for (const b of bankAccounts) m.set(b.id, b);
    return m;
  }, [bankAccounts]);

  const billAccountMap = useMemo(() => {
    const m = new Map<string, BillAccount>();
    for (const b of billAccounts) m.set(b.id, b);
    return m;
  }, [billAccounts]);

  type EnrichedBill = BillRow & {
    voucher: string;
    bank_account_name: string;
    bill_account_name: string;
    bill_account_id_for_link: string | null;
    bill_type: string;
    period: string;
    provider_category: ProviderCategory | null;
    payment_status: PaymentStatus;
    days_late: number;
  };

  const enriched: EnrichedBill[] = useMemo(
    () =>
      rows.map((r) => {
        const billAcc = r.bill_account_id
          ? billAccountMap.get(r.bill_account_id) ?? null
          : null;
        const cat: ProviderCategory | null = billAcc
          ? providerCategoryFor(billAcc.provider)
          : null;
        const status = paymentStatus(r);
        return {
          ...r,
          voucher: voucherNo(r.id),
          bank_account_name: r.bank_account_id
            ? bankMap.get(r.bank_account_id)?.name ?? "—"
            : "—",
          bill_account_name: billAcc
            ? billAcc.nickname
            : r.bill_account_id
              ? providerLabelFor("other", null)
              : "—",
          bill_account_id_for_link: billAcc ? billAcc.id : null,
          bill_type: billTypeLabel(r.subcategory),
          period: periodLabel(r),
          provider_category: cat,
          payment_status: status.status,
          days_late: status.daysLate,
        };
      }),
    [rows, bankMap, billAccountMap],
  );

  const filtered = useMemo(() => {
    const q = vendorQuery.trim().toLowerCase();
    return enriched.filter((r) => {
      if (r.expense_date < dateRange.from) return false;
      if (r.expense_date > dateRange.to) return false;
      if (q && !r.vendor.toLowerCase().includes(q)) return false;
      if (activeCategory && r.provider_category !== activeCategory) {
        return false;
      }
      if (onlyWithUnits && r.units_consumed == null) return false;
      if (overdueOnly && r.payment_status !== "late") return false;
      return true;
    });
  }, [enriched, dateRange, vendorQuery, activeCategory, onlyWithUnits, overdueOnly]);

  // KPI strip — auto-updates against the filtered rows. Single "units"
  // label across all bill types matches how PK utility bills actually
  // print the figure ("300 units"), so we can sum freely.
  const summary = useMemo(() => {
    let totalAmount = 0;
    let totalUnits = 0;
    let anyUnits = false;
    let lateCount = 0;
    for (const r of filtered) {
      totalAmount += r.amount;
      if (r.units_consumed != null) {
        totalUnits += r.units_consumed;
        anyUnits = true;
      }
      if (r.payment_status === "late") lateCount += 1;
    }
    return {
      count: filtered.length,
      totalAmount,
      totalUnits: anyUnits ? totalUnits : null,
      lateCount,
    };
  }, [filtered]);

  const columns: ReportColumn<EnrichedBill>[] = useMemo(
    () => [
      {
        id: "date",
        label: "Date",
        defaultOn: true,
        accessor: (r) => formatDate(r.expense_date),
      },
      {
        id: "bill_account",
        label: "Bill account",
        defaultOn: true,
        accessor: (r) => r.bill_account_name,
      },
      {
        id: "bill_type",
        label: "Bill type",
        defaultOn: true,
        accessor: (r) => r.bill_type,
      },
      {
        id: "vendor",
        label: "Vendor",
        defaultOn: true,
        accessor: (r) => r.vendor || "—",
      },
      {
        id: "period",
        label: "Period covered",
        defaultOn: true,
        accessor: (r) => r.period,
      },
      {
        id: "due_date",
        label: "Due date",
        defaultOn: true,
        accessor: (r) => (r.due_date ? formatDate(r.due_date) : "—"),
      },
      {
        id: "status",
        label: "Status",
        defaultOn: true,
        accessor: (r) =>
          statusLabel({ status: r.payment_status, daysLate: r.days_late }),
      },
      {
        // Single "Units" column — accessor returns the raw number so
        // CSV is spreadsheet-summable. HTML preview shows the un-grouped
        // raw number; PDF formats it via the report exporter.
        id: "units",
        label: "Units",
        defaultOn: true,
        accessor: (r) => (r.units_consumed != null ? r.units_consumed : ""),
      },
      {
        id: "amount",
        label: "Amount",
        defaultOn: true,
        numeric: true,
        accessor: (r) => r.amount,
      },
      {
        id: "bank_account",
        label: "Bank account",
        defaultOn: true,
        accessor: (r) => r.bank_account_name,
      },
      {
        id: "voucher",
        label: "Voucher #",
        defaultOn: true,
        accessor: (r) => r.voucher,
      },
    ],
    [],
  );

  const { enabledIds, visibleColumns, setColumn } = useColumnPicker(
    "bills",
    columns,
  );

  const selectedBillAccount = initialBillAccountId
    ? billAccountMap.get(initialBillAccountId) ?? null
    : null;

  const extraFilters = (
    <>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Bill account
        </Label>
        <Select
          value={initialBillAccountId ?? "__all__"}
          onValueChange={(v) =>
            setBillAccountFilter(v === "__all__" ? null : v)
          }
        >
          <SelectTrigger className="min-w-[200px]">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All accounts</SelectItem>
            {billAccounts.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.nickname}
                {b.is_active ? "" : " (inactive)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Provider category
        </Label>
        <Select
          value={activeCategory ?? "__all__"}
          onValueChange={(v) =>
            setCategoryFilter(
              v === "__all__" ? null : (v as ProviderCategory),
            )
          }
        >
          <SelectTrigger className="min-w-[180px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {CATEGORY_FILTER_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Vendor
        </Label>
        <Input
          value={vendorQuery}
          onChange={(e) => setVendorQuery(e.target.value)}
          placeholder="Search vendor"
          className="min-w-[180px]"
        />
      </div>
    </>
  );

  const filterParts: string[] = [];
  if (selectedBillAccount) {
    filterParts.push(`Bill account: ${selectedBillAccount.nickname}`);
  }
  if (activeCategory) {
    filterParts.push(`Category: ${CATEGORY_LABEL[activeCategory]}`);
  }
  if (vendorQuery) {
    filterParts.push(`Vendor: contains "${vendorQuery}"`);
  }
  if (onlyWithUnits) {
    filterParts.push("Only bills with units");
  }
  if (overdueOnly) {
    filterParts.push("Overdue only");
  }
  const filtersLine = filterParts.length ? filterParts.join(" · ") : undefined;

  // Wrap the visible Bill account cell with a drilldown link. We keep
  // the CSV/PDF accessor pure (plain nickname) so exports stay clean —
  // the link decoration is only applied in the HTML preview via a
  // shadow column that swaps the accessor result for an anchor element.
  // ReportTable accessors return string | number; we render via a small
  // helper above the table instead. Simpler approach: render the link
  // inline by overriding the bill_account column accessor to include
  // an anchor — but ReportColumn.accessor returns string|number. So we
  // instead render a custom JSX table for HTML and rely on column
  // accessors for CSV/PDF. For the bills report the existing
  // ReportTable already handles all columns; we cannot easily insert
  // a link without changing ReportTable. Use a per-row callout above
  // the shell that lists "Drill in →" links for the unique accounts
  // in view. This stays additive without changing ReportTable.

  // List of distinct (id, nickname) pairs visible in the current
  // filter — surfaced as a quick "Open account" strip above the table.
  const accountsInView = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of filtered) {
      if (r.bill_account_id_for_link && !seen.has(r.bill_account_id_for_link)) {
        seen.set(r.bill_account_id_for_link, r.bill_account_name);
      }
    }
    return Array.from(seen.entries());
  }, [filtered]);

  // Opening balance = building fund at the START of the selected period
  // (same formula as the dashboard "Funds Available" card, bounded to
  // period_start). Bills paid in the period reduce that fund.
  const openingTotal = openingBalance;

  // Closing = opening minus ALL bills paid in the period — not just the
  // filtered subset. Client-side filters (vendor, category, overdue) only
  // narrow WHAT IS SHOWN; the fund was reduced by every bill that was paid.
  const periodTotalAllBills = useMemo(
    () => enriched.reduce((s, r) => s + r.amount, 0),
    [enriched],
  );
  const closingTotal = openingTotal - periodTotalAllBills;

  // Pre-computed cells for the pinned balance rows — aligned to visibleColumns.
  // Label goes in column 0; amount goes in the "amount" column; all others blank.
  const pinnedTopRow = useMemo(
    () =>
      visibleColumns.map((c, i) => {
        if (i === 0) return "Opening Balance";
        if (c.id === "amount") return openingTotal;
        return "";
      }),
    [visibleColumns, openingTotal],
  );

  const pinnedBottomRow = useMemo(
    () =>
      visibleColumns.map((c, i) => {
        if (i === 0) return "Closing Balance";
        if (c.id === "amount") return closingTotal;
        return "";
      }),
    [visibleColumns, closingTotal],
  );

  return (
    <div className="space-y-5">
      {/* Compact KPI strip — sits above ReportShell so accountant /
          auditor sees totals + units at a glance. Live-updates with
          filters because it reads from the same `filtered` array as
          the preview table. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card-soft py-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Total bills
          </div>
          <div className="text-2xl font-semibold mt-1">{summary.count}</div>
        </div>
        <div className="card-soft py-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Total amount
          </div>
          <div className="text-2xl font-semibold mt-1">
            {formatCurrency(summary.totalAmount)}
          </div>
        </div>
        <div className="card-soft py-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Total units
          </div>
          <div className="text-2xl font-semibold mt-1">
            {summary.totalUnits != null
              ? `${formatUnits(summary.totalUnits)} ${UNITS_LABEL}`
              : "—"}
          </div>
        </div>
        <div className="card-soft py-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Late payments
          </div>
          <div
            className={`text-2xl font-semibold mt-1 ${
              summary.lateCount > 0 ? "text-destructive" : ""
            }`}
          >
            {summary.lateCount}
          </div>
          {summary.lateCount > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Bills paid after due date
            </p>
          )}
        </div>
      </div>

      {/* Drilldown strip — every distinct bill account in view gets a
          one-click "open account history" pill. Auditor lands on the
          per-account page with 24-month trend + every bill. */}
      {accountsInView.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Open account
          </span>
          {accountsInView.map(([id, nickname]) => (
            <Link
              key={id}
              href={`/admin/bill-accounts/${id}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-border bg-secondary text-sm hover:bg-secondary/80 transition-colors"
              title="View account history"
            >
              {nickname}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ))}
        </div>
      )}

      <ReportShell
        title="Bills report"
        subtitle="Recurring utilities — K-Electric, SSGC, internet, lift AMC, security."
        buildingName={buildingName}
        reportName="bills"
        filename={`bills_${buildingName.replace(/\s+/g, "_")}`}
        dateRange={dateRange}
        setDateRange={setDateRange}
        extraFilters={extraFilters}
        filtersLine={filtersLine}
        columns={columns}
        visibleColumns={visibleColumns}
        enabledIds={enabledIds}
        setColumn={setColumn}
        rows={filtered}
        emptyText="No bills recorded in this period."
        pinnedTopRow={pinnedTopRow}
        pinnedBottomRow={pinnedBottomRow}
      />

      {/* Units-only toggle — small affordance under the table to flip
          straight into "show only rows that carry a consumption reading"
          view. Most useful for spotting newly-added KE/SSGC accounts
          where admin forgot to record the reading. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <input
            id="only-with-units"
            type="checkbox"
            className="h-4 w-4"
            checked={onlyWithUnits}
            onChange={(e) => setOnlyWithUnitsUrl(e.target.checked)}
          />
          <label htmlFor="only-with-units" className="text-muted-foreground">
            Show only bills with units recorded
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="overdue-only"
            type="checkbox"
            className="h-4 w-4"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnlyUrl(e.target.checked)}
          />
          <label htmlFor="overdue-only" className="text-muted-foreground">
            Show only late payments
          </label>
        </div>
      </div>
    </div>
  );
}
