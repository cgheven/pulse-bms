"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ReportShell } from "@/components/admin/reports/report-shell";
import { useColumnPicker } from "@/components/admin/reports/column-picker";
import { useReportDateRange } from "@/lib/reports/use-report-date-range";
import { formatDate } from "@/lib/utils";
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
  recurrence: "monthly" | "quarterly" | "yearly" | null;
};

type BankAccount = { id: string; name: string; type: "cash" | "bank" };

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

export function BillsReportClient({
  buildingName,
  initialDateRange,
  rows,
  bankAccounts,
}: {
  buildingName: string;
  initialDateRange: DateRange;
  rows: BillRow[];
  bankAccounts: BankAccount[];
}) {
  // dateRange is URL-driven (?from=&to=) so the RSC parent can refetch
  // with server-side date bounds rather than pulling every bill row.
  const [dateRange, setDateRange] = useReportDateRange(initialDateRange);
  const [vendorQuery, setVendorQuery] = useState("");

  const bankMap = useMemo(() => {
    const m = new Map<string, BankAccount>();
    for (const b of bankAccounts) m.set(b.id, b);
    return m;
  }, [bankAccounts]);

  type EnrichedBill = BillRow & {
    voucher: string;
    bank_account_name: string;
    bill_type: string;
    period: string;
  };

  const enriched: EnrichedBill[] = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        voucher: voucherNo(r.id),
        bank_account_name: r.bank_account_id
          ? bankMap.get(r.bank_account_id)?.name ?? "—"
          : "—",
        bill_type: billTypeLabel(r.subcategory),
        period: periodLabel(r),
      })),
    [rows, bankMap],
  );

  const filtered = useMemo(() => {
    const q = vendorQuery.trim().toLowerCase();
    return enriched.filter((r) => {
      if (r.expense_date < dateRange.from) return false;
      if (r.expense_date > dateRange.to) return false;
      if (q && !r.vendor.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriched, dateRange, vendorQuery]);

  const columns: ReportColumn<EnrichedBill>[] = useMemo(
    () => [
      {
        id: "date",
        label: "Date",
        defaultOn: true,
        accessor: (r) => formatDate(r.expense_date),
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

  const vendorFilter = (
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
  );

  const filtersLine = vendorQuery
    ? `Vendor: contains "${vendorQuery}"`
    : undefined;

  return (
    <ReportShell
      title="Bills report"
      subtitle="Recurring utilities — K-Electric, SSGC, internet, lift AMC, security."
      buildingName={buildingName}
      reportName="bills"
      filename={`bills_${buildingName.replace(/\s+/g, "_")}`}
      dateRange={dateRange}
      setDateRange={setDateRange}
      extraFilters={vendorFilter}
      filtersLine={filtersLine}
      columns={columns}
      visibleColumns={visibleColumns}
      enabledIds={enabledIds}
      setColumn={setColumn}
      rows={filtered}
      emptyText="No bills recorded in this period."
    />
  );
}
