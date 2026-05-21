"use client";

import { useMemo, useState } from "react";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { DateRangePicker } from "@/components/admin/reports/date-range-picker";
import { useReportDateRange } from "@/lib/reports/use-report-date-range";
import { eachDay } from "@/lib/reports/date-range";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { DateRange } from "@/lib/reports/types";
import { downloadDayBookPdf } from "@/lib/reports/day-book-pdf";
import { downloadDayBookCsv } from "@/lib/reports/day-book-csv";
import { PAYMENT_MODE } from "@/types";

// Salary expense lines are tagged with this synthetic category so the
// downstream CSV/PDF builders can distinguish them from real expense rows.
const SALARY_KIND = "salary" as const;

type BankAccount = {
  id: string;
  name: string;
  type: "cash" | "bank";
  opening_balance: number;
  opening_balance_date: string;
  is_active: boolean;
};

type PaymentRow = {
  id: string;
  date: string;
  amount: number;
  payment_mode: string;
  category: string;
  receipt_no: string;
  bank_account_id: string | null;
  flat_number: string;
  resident_name: string;
  notes: string;
};

type ExpenseRow = {
  id: string;
  date: string;
  amount: number;
  category: string;
  subcategory: string;
  description: string;
  vendor: string;
  bank_account_id: string | null;
};

type SalaryRow = {
  id: string;
  date: string;
  amount: number;
  payment_mode: string;
  slip_no: string;
  bank_account_id: string | null;
  staff_name: string;
  notes: string;
};

// Display labels mirror the Income Register so accountants see consistent
// vocabulary across reports. "credit_carryforward" income is the case
// where a flat's prior overpayment is being applied to a new invoice —
// it's virtual (no cash moved) so we mark it but don't sum it into the
// day's real income for balance math.
const CATEGORY_LABELS: Record<string, string> = {
  maintenance: "Maintenance",
  entry_fee: "Entry Fee",
  transfer_fee: "Transfer Fee",
  fine: "Fine",
  other: "Other",
  credit_carryforward: "Credit carry-forward",
};

const MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  bank_transfer: "Bank transfer",
  online: "Online",
  cheque: "Cheque",
  credit_carryforward: "Credit applied",
};

export type DayBookIncomeLine = {
  id: string;
  category: string;
  categoryLabel: string;
  description: string; // e.g. "A-101 · Ali Khan"
  mode: string;
  modeLabel: string;
  bankName: string;
  amount: number;
  isCredit: boolean; // credit_carryforward → virtual, not in cash math
};

export type DayBookExpenseLine = {
  id: string;
  category: string;
  categoryLabel: string;
  description: string; // e.g. "Lift Repair · KONE Lifts"
  source: string; // vendor or staff name
  bankName: string;
  amount: number;
};

export type DayBookDay = {
  date: string;
  label: string;
  opening: number;
  closing: number;
  income: DayBookIncomeLine[];
  expenses: DayBookExpenseLine[];
  realIncomeTotal: number;
  expenseTotal: number;
  seedAmount: number; // bank seed activated on this date (rare)
  isEmpty: boolean; // no real transactions or seeds
};

// Pretty-prints expense category snake_case → Title Case. Subcategory
// (if set) is the most-meaningful label for the accountant, so we
// prefer it.
function expenseLabel(category: string, subcategory: string): string {
  const raw = subcategory && subcategory.trim() ? subcategory : category;
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DayBookClient({
  buildingName,
  initialDateRange,
  bankAccounts,
  payments,
  expenses,
  salaries,
}: {
  buildingName: string;
  initialDateRange: DateRange;
  bankAccounts: BankAccount[];
  payments: PaymentRow[];
  expenses: ExpenseRow[];
  salaries: SalaryRow[];
}) {
  const [dateRange, setDateRange] = useReportDateRange(initialDateRange);
  // bank filter: "all" (combined) | "cash" (cash drawers only) | bank account uuid
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [exporting, setExporting] = useState(false);

  // Build the set of bank ids the filter resolves to. null = no filter.
  const bankIds: Set<string> | null = useMemo(() => {
    if (bankFilter === "all") return null;
    if (bankFilter === "cash") {
      return new Set(
        bankAccounts.filter((b) => b.type === "cash").map((b) => b.id),
      );
    }
    return new Set([bankFilter]);
  }, [bankFilter, bankAccounts]);

  // NULL bank_account_id rows are treated as cash (pre-multi-bank legacy data).
  // When the active filter is "all", "cash", or a specific cash-type bank,
  // NULL rows are included. When filter points at a non-cash bank, NULL
  // rows are excluded (they belong to cash, not to a specific bank).
  const includesNullAsCash = useMemo(() => {
    if (bankFilter === "all") return true;
    if (bankFilter === "cash") return true;
    return bankAccounts.find((b) => b.id === bankFilter)?.type === "cash";
  }, [bankFilter, bankAccounts]);

  // Single predicate used by every accumulator below. Centralising the
  // null-as-cash rule avoids per-loop drift.
  const inFilter = useMemo(() => {
    return (row: { bank_account_id: string | null }): boolean => {
      if (!bankIds) return true; // "all"
      if (row.bank_account_id == null) return includesNullAsCash;
      return bankIds.has(row.bank_account_id);
    };
  }, [bankIds, includesNullAsCash]);

  const bankMap = useMemo(() => {
    const m = new Map<string, BankAccount>();
    for (const b of bankAccounts) m.set(b.id, b);
    return m;
  }, [bankAccounts]);

  // O(N + D) running-balance math identical to Cash Book: build
  // date-keyed delta maps from all movements ≤ dateRange.to, then walk
  // the visible date axis carrying a running balance from the first
  // visible day's opening.
  //
  // For Day Book we ALSO keep per-transaction lists keyed by ISO date,
  // so each card can render the line-by-line narrative.
  const days: DayBookDay[] = useMemo(() => {
    // --- 1. Pre-aggregate ALL movements ≤ dateRange.to into per-day
    // sums (for opening-balance roll-forward) AND per-day lists (for
    // visible-day rendering).
    const realIncomeByDate = new Map<string, number>();
    const expenseByDate = new Map<string, number>();

    type IncomeByDay = DayBookIncomeLine[];
    type ExpenseByDay = DayBookExpenseLine[];
    const incomeListByDate = new Map<string, IncomeByDay>();
    const expenseListByDate = new Map<string, ExpenseByDay>();

    // NULL bank_account_id rows are treated as cash (pre-multi-bank legacy data).
    // Payments → Income lines
    for (const p of payments) {
      if (!inFilter(p)) continue;
      const isCredit = p.payment_mode === PAYMENT_MODE.CREDIT_CARRYFORWARD;
      // Credit carry-forward is virtual cash — don't include in real
      // income totals used for balance math.
      if (!isCredit) {
        realIncomeByDate.set(
          p.date,
          (realIncomeByDate.get(p.date) ?? 0) + p.amount,
        );
      }

      // Only build per-day lists for dates in the visible range —
      // history before `from` only contributes to opening balance.
      if (p.date < dateRange.from || p.date > dateRange.to) continue;

      const categoryLabel = CATEGORY_LABELS[p.category] ?? p.category;
      // Drop the dangling " · —" when no resident is linked to a payment.
      // Receipts often pre-date a resident being recorded; showing the flat
      // alone is cleaner than printing a placeholder dash.
      const hasResident =
        p.resident_name && p.resident_name !== "—" && p.resident_name.trim() !== "";
      const description = hasResident
        ? `${p.flat_number} · ${p.resident_name}`
        : p.flat_number;
      const modeLabel = MODE_LABELS[p.payment_mode] ?? p.payment_mode;
      const bankName = p.bank_account_id
        ? bankMap.get(p.bank_account_id)?.name ?? "—"
        : "—";

      const list = incomeListByDate.get(p.date) ?? [];
      list.push({
        id: p.id,
        category: p.category,
        categoryLabel,
        description,
        mode: p.payment_mode,
        modeLabel,
        bankName,
        amount: p.amount,
        isCredit,
      });
      incomeListByDate.set(p.date, list);
    }

    // NULL bank_account_id rows are treated as cash (pre-multi-bank legacy data).
    // Expenses → Expense lines
    for (const e of expenses) {
      if (!inFilter(e)) continue;
      expenseByDate.set(
        e.date,
        (expenseByDate.get(e.date) ?? 0) + e.amount,
      );

      if (e.date < dateRange.from || e.date > dateRange.to) continue;

      const categoryLabel = expenseLabel(e.category, e.subcategory);
      const vendor = e.vendor || e.description || "—";
      const bankName = e.bank_account_id
        ? bankMap.get(e.bank_account_id)?.name ?? "—"
        : "—";

      const list = expenseListByDate.get(e.date) ?? [];
      list.push({
        id: e.id,
        category: e.category,
        categoryLabel,
        description: e.description || categoryLabel,
        source: vendor,
        bankName,
        amount: e.amount,
      });
      expenseListByDate.set(e.date, list);
    }

    // NULL bank_account_id rows are treated as cash (pre-multi-bank legacy data).
    // Salary payments → Expense lines under "Salary" category
    for (const s of salaries) {
      if (!inFilter(s)) continue;
      expenseByDate.set(
        s.date,
        (expenseByDate.get(s.date) ?? 0) + s.amount,
      );

      if (s.date < dateRange.from || s.date > dateRange.to) continue;

      const bankName = s.bank_account_id
        ? bankMap.get(s.bank_account_id)?.name ?? "—"
        : "—";

      const list = expenseListByDate.get(s.date) ?? [];
      list.push({
        id: s.id,
        category: SALARY_KIND,
        categoryLabel: "Salary",
        description: `Salary (${s.staff_name})`,
        source: s.staff_name,
        bankName,
        amount: s.amount,
      });
      expenseListByDate.set(s.date, list);
    }

    // --- 2. Compute opening balance on the first visible day.
    // baseOpening = sum(bank_seeds with date <= from) + (incomeBefore - expenseBefore).
    let baseOpening = 0;
    for (const b of bankAccounts) {
      if (bankIds && !bankIds.has(b.id)) continue;
      if (b.opening_balance_date <= dateRange.from) baseOpening += b.opening_balance;
    }
    for (const [d, v] of realIncomeByDate) if (d < dateRange.from) baseOpening += v;
    for (const [d, v] of expenseByDate) if (d < dateRange.from) baseOpening -= v;

    // Per-day seed contributions WITHIN the range (rare — admin
    // backdating cash on hand mid-range).
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

    // --- 3. Walk the date axis carrying a running balance. Each day's
    // closing = opening + real_income + seed - expenses.
    const dayList = eachDay(dateRange.from, dateRange.to);
    let running = baseOpening;
    return dayList.map((d): DayBookDay => {
      const opening = running;
      const realIncome = realIncomeByDate.get(d) ?? 0;
      const exp = expenseByDate.get(d) ?? 0;
      const seed = seedByDate.get(d) ?? 0;
      const closing = opening + realIncome + seed - exp;
      running = closing;

      const incomeList = incomeListByDate.get(d) ?? [];
      const expenseList = expenseListByDate.get(d) ?? [];
      // A day is "empty" only when there are zero ledger entries AND no
      // seed activated — we still want to show seed activations as the
      // single income line they generated.
      const isEmpty = incomeList.length === 0 && expenseList.length === 0 && seed === 0;

      return {
        date: d,
        label: formatDate(d),
        opening,
        closing,
        income: incomeList,
        expenses: expenseList,
        realIncomeTotal: realIncome,
        expenseTotal: exp,
        seedAmount: seed,
        isEmpty,
      };
    });
  }, [
    payments,
    expenses,
    salaries,
    bankAccounts,
    bankIds,
    inFilter,
    bankMap,
    dateRange,
  ]);

  const bankFilterLabel = useMemo(() => {
    if (bankFilter === "all") return "All combined";
    if (bankFilter === "cash") return "Cash only";
    const b = bankAccounts.find((x) => x.id === bankFilter);
    return b ? b.name : "Unknown";
  }, [bankFilter, bankAccounts]);

  const period = `${formatDate(dateRange.from)} – ${formatDate(dateRange.to)}`;
  const fileStamp = `${dateRange.from}_to_${dateRange.to}`;
  const baseName = `day-book_${buildingName.replace(/\s+/g, "_")}_${fileStamp}`;

  const filtersLine = `Bank: ${bankFilterLabel}`;

  const onCsv = () => {
    downloadDayBookCsv({
      filename: baseName,
      days,
    });
  };

  const onPdf = async () => {
    setExporting(true);
    try {
      await downloadDayBookPdf({
        meta: {
          title: "Day Book",
          buildingName,
          period,
          filtersLine,
          filename: baseName,
        },
        days,
      });
    } finally {
      setExporting(false);
    }
  };

  // Has anything happened in the whole range? If every day is empty
  // AND every opening matches every closing, render the friendly empty
  // state rather than a parade of identical "No activity" lines.
  const allEmpty = days.length === 0 || days.every((d) => d.isEmpty);

  return (
    <div className="space-y-5">
      {/* Report subtitle */}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Day Book</h2>
        <p className="text-muted-foreground text-sm">
          Daily narrative journal (Roznamcha) — opening, income, expenses, closing per day.
        </p>
      </div>

      {/* Filter bar */}
      <div className="card-soft space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
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
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={onCsv}
            disabled={days.length === 0}
            className="gap-1.5"
          >
            <Download className="w-4 h-4" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onPdf}
            disabled={exporting || days.length === 0}
            className="gap-1.5"
          >
            <FileText className="w-4 h-4" />
            {exporting ? "Generating…" : "PDF"}
          </Button>
        </div>
      </div>

      {/* Per-day narrative cards — printed-document look (white paper). */}
      {allEmpty ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 flex flex-col items-center gap-2 text-gray-500 shadow-sm">
          <FileSpreadsheet className="w-10 h-10 opacity-40" />
          <p className="text-sm">No activity in this period.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map((d) => (
            <DayCard key={d.date} day={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayCard({ day }: { day: DayBookDay }) {
  // Empty day → compact one-line summary so long quiet stretches don't
  // bloat the report. Still shows the running balance so the auditor
  // can spot-check carry-forward without clicking around.
  if (day.isEmpty) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
        {/* Use h3 so screen readers announce empty-day date headers
            consistently with the non-empty day cards below. */}
        <h3 className="text-sm font-semibold text-gray-800">{day.label}</h3>
        <span className="text-gray-500">
          No activity · Balance:{" "}
          <span className="tabular-nums font-medium text-gray-800">
            {formatCurrency(day.closing)}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white text-gray-900 shadow-sm">
      {/* Date header */}
      <div className="px-5 py-3 border-b border-gray-200 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{day.label}</h3>
        <div className="text-xs uppercase tracking-wider text-gray-500">
          Opening:{" "}
          <span className="tabular-nums font-medium text-gray-700">
            {formatCurrency(day.opening)}
          </span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Income section */}
        {day.income.length > 0 || day.seedAmount > 0 ? (
          <section>
            <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
              Income
            </h4>
            <table className="w-full text-sm">
              <tbody>
                {day.income.map((line) => (
                  <tr
                    key={line.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-1.5 pr-3 text-gray-900">
                      <span className="font-medium">{line.categoryLabel}</span>{" "}
                      <span className="text-gray-500">
                        ({line.description})
                      </span>
                      {line.isCredit && (
                        <span className="ml-2 text-xs text-gray-500 italic">
                          (credit applied)
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pl-3 text-right tabular-nums font-medium text-gray-900 whitespace-nowrap">
                      {formatCurrency(line.amount)}
                    </td>
                  </tr>
                ))}
                {day.seedAmount > 0 && (
                  <tr className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 pr-3 text-gray-900">
                      <span className="font-medium">Opening cash</span>{" "}
                      <span className="text-gray-500">(bank seed)</span>
                    </td>
                    <td className="py-1.5 pl-3 text-right tabular-nums font-medium text-gray-900 whitespace-nowrap">
                      {formatCurrency(day.seedAmount)}
                    </td>
                  </tr>
                )}
                <tr className="border-t border-gray-200">
                  <td className="pt-2 pr-3 text-xs uppercase tracking-wider text-gray-500">
                    Income total
                  </td>
                  <td className="pt-2 pl-3 text-right tabular-nums text-gray-600 whitespace-nowrap">
                    {formatCurrency(day.realIncomeTotal + day.seedAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        ) : null}

        {/* Expenses section */}
        {day.expenses.length > 0 && (
          <section>
            <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
              Expenses
            </h4>
            <table className="w-full text-sm">
              <tbody>
                {day.expenses.map((line) => (
                  <tr
                    key={line.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-1.5 pr-3 text-gray-900">
                      <span className="font-medium">{line.categoryLabel}</span>{" "}
                      <span className="text-gray-500">({line.source})</span>
                    </td>
                    <td className="py-1.5 pl-3 text-right tabular-nums font-medium text-gray-900 whitespace-nowrap">
                      {formatCurrency(line.amount)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200">
                  <td className="pt-2 pr-3 text-xs uppercase tracking-wider text-gray-500">
                    Expense total
                  </td>
                  <td className="pt-2 pl-3 text-right tabular-nums text-gray-600 whitespace-nowrap">
                    {formatCurrency(day.expenseTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}
      </div>

      {/* Closing balance footer */}
      <div className="px-5 py-3 border-t-2 border-gray-300 bg-gray-50 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-gray-600 font-semibold">
          Closing balance
        </span>
        <span className="text-base font-bold text-gray-900 tabular-nums">
          {formatCurrency(day.closing)}
        </span>
      </div>
    </div>
  );
}
