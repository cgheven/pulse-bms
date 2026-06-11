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
import { formatDate } from "@/lib/utils";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expense-constants";
import type { DateRange, ReportColumn } from "@/lib/reports/types";

type ExpenseRow = {
  id: string;
  expense_date: string;
  category: string;
  subcategory: string;
  description: string;
  vendor: string;
  amount: number;
  bank_account_id: string | null;
};

type BankAccount = { id: string; name: string; type: "cash" | "bank" };

// Generate a short voucher number from the row id. Receipts get RCPT-* on
// payments; expenses don't have a column for it yet, so we derive a short
// human-readable number from the uuid. Same scheme can be replaced later
// with a generated column without breaking the report shape.
function voucherNo(id: string): string {
  return "EXP-" + id.slice(0, 8).toUpperCase();
}


export function ExpensesReportClient({
  buildingName,
  initialDateRange,
  rows,
  bankAccounts,
}: {
  buildingName: string;
  initialDateRange: DateRange;
  rows: ExpenseRow[];
  bankAccounts: BankAccount[];
}) {
  // dateRange is URL-driven: changing it pushes ?from=&to= which triggers
  // the RSC parent to refetch with new bounds (server-side date filter).
  const [dateRange, setDateRange] = useReportDateRange(initialDateRange);
  const [category, setCategory] = useState<string>("all");

  const bankMap = useMemo(() => {
    const m = new Map<string, BankAccount>();
    for (const b of bankAccounts) m.set(b.id, b);
    return m;
  }, [bankAccounts]);

  type EnrichedRow = ExpenseRow & {
    voucher: string;
    bank_account_name: string;
  };

  const enriched: EnrichedRow[] = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        voucher: voucherNo(r.id),
        bank_account_name: r.bank_account_id
          ? bankMap.get(r.bank_account_id)?.name ?? "—"
          : "—",
      })),
    [rows, bankMap],
  );

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (r.expense_date < dateRange.from) return false;
      if (r.expense_date > dateRange.to) return false;
      if (category !== "all" && r.category !== category) return false;
      return true;
    });
  }, [enriched, dateRange, category]);

  const columns: ReportColumn<EnrichedRow>[] = useMemo(
    () => [
      {
        id: "date",
        label: "Date",
        defaultOn: true,
        accessor: (r) => formatDate(r.expense_date),
      },
      {
        id: "category",
        label: "Category",
        defaultOn: true,
        accessor: (r) => EXPENSE_CATEGORY_LABELS[r.category] ?? r.category,
      },
      {
        id: "subcategory",
        label: "Subcategory",
        defaultOn: true,
        accessor: (r) => r.subcategory || "—",
      },
      {
        id: "description",
        label: "Description",
        defaultOn: true,
        accessor: (r) => r.description,
      },
      {
        id: "vendor",
        label: "Vendor",
        defaultOn: true,
        accessor: (r) => r.vendor || "—",
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
    "expenses",
    columns,
  );

  const categoryFilter = (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        Category
      </Label>
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="min-w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
            <SelectItem key={k} value={k}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const filtersLine =
    category !== "all"
      ? `Category: ${EXPENSE_CATEGORY_LABELS[category] ?? category}`
      : undefined;

  return (
    <ReportShell
      title="Expenses report"
      subtitle="Operating spend — diesel, supplies, repairs, hospitality, one-offs."
      buildingName={buildingName}
      reportName="expenses"
      filename={`expenses_${buildingName.replace(/\s+/g, "_")}`}
      dateRange={dateRange}
      setDateRange={setDateRange}
      extraFilters={categoryFilter}
      filtersLine={filtersLine}
      columns={columns}
      visibleColumns={visibleColumns}
      enabledIds={enabledIds}
      setColumn={setColumn}
      rows={filtered}
      emptyText="No expenses recorded in this period."
    />
  );
}
