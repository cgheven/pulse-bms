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
import type { DateRange, ReportColumn } from "@/lib/reports/types";

type MaintRow = {
  id: string;
  payment_date: string;
  amount: number;
  payment_mode: string;
  receipt_no: string;
  flat_id: string;
  flat_number: string;
  resident_name: string;
  invoice_month: string | null;
  bank_account_id: string | null;
  received_by: string;
};

type BankAccount = { id: string; name: string; type: "cash" | "bank" };

const MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  online: "Online",
  cheque: "Cheque",
  credit_carryforward: "Credit carry-forward",
};

function monthLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-PK", { month: "long", year: "numeric" });
}

export function MaintenanceCollectionClient({
  buildingName,
  initialDateRange,
  rows,
  flats,
  bankAccounts,
  receivers,
}: {
  buildingName: string;
  initialDateRange: DateRange;
  rows: MaintRow[];
  flats: { id: string; flat_number: string }[];
  bankAccounts: BankAccount[];
  receivers: string[];
}) {
  // URL-driven date range; RSC parent refetches on change.
  const [dateRange, setDateRange] = useReportDateRange(initialDateRange);
  const [flatId, setFlatId] = useState<string>("all");
  const [receiver, setReceiver] = useState<string>("all");

  const bankMap = useMemo(() => {
    const m = new Map<string, BankAccount>();
    for (const b of bankAccounts) m.set(b.id, b);
    return m;
  }, [bankAccounts]);

  type EnrichedRow = MaintRow & {
    mode_label: string;
    bank_account_name: string;
    invoice_month_label: string;
  };

  const enriched: EnrichedRow[] = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        mode_label: MODE_LABELS[r.payment_mode] ?? r.payment_mode,
        bank_account_name: r.bank_account_id
          ? bankMap.get(r.bank_account_id)?.name ?? "—"
          : "—",
        invoice_month_label: monthLabel(r.invoice_month),
      })),
    [rows, bankMap],
  );

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (r.payment_date < dateRange.from) return false;
      if (r.payment_date > dateRange.to) return false;
      if (flatId !== "all" && r.flat_id !== flatId) return false;
      if (receiver !== "all" && r.received_by !== receiver) return false;
      return true;
    });
  }, [enriched, dateRange, flatId, receiver]);

  const columns: ReportColumn<EnrichedRow>[] = useMemo(
    () => [
      {
        id: "date",
        label: "Date",
        defaultOn: true,
        accessor: (r) => formatDate(r.payment_date),
      },
      {
        id: "flat",
        label: "Flat",
        defaultOn: true,
        accessor: (r) => r.flat_number,
      },
      {
        id: "resident",
        label: "Resident",
        defaultOn: true,
        accessor: (r) => r.resident_name,
      },
      {
        id: "invoice_month",
        label: "Invoice month",
        defaultOn: true,
        accessor: (r) => r.invoice_month_label,
      },
      {
        id: "amount",
        label: "Amount",
        defaultOn: true,
        numeric: true,
        accessor: (r) => r.amount,
      },
      {
        id: "mode",
        label: "Mode",
        defaultOn: true,
        accessor: (r) => r.mode_label,
      },
      {
        id: "bank_account",
        label: "Bank account",
        defaultOn: true,
        accessor: (r) => r.bank_account_name,
      },
      {
        id: "receiver",
        label: "Receiver",
        defaultOn: true,
        accessor: (r) => r.received_by,
      },
      {
        id: "receipt",
        label: "Receipt #",
        defaultOn: true,
        accessor: (r) => r.receipt_no,
      },
    ],
    [],
  );

  const { enabledIds, visibleColumns, setColumn } = useColumnPicker(
    "maintenance-collection",
    columns,
  );

  const extraFilters = (
    <>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Flat
        </Label>
        <Select value={flatId} onValueChange={setFlatId}>
          <SelectTrigger className="min-w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All flats</SelectItem>
            {flats.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.flat_number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Receiver
        </Label>
        <Select value={receiver} onValueChange={setReceiver}>
          <SelectTrigger className="min-w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All receivers</SelectItem>
            {receivers.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );

  const filterChips: string[] = [];
  if (flatId !== "all") {
    const f = flats.find((x) => x.id === flatId);
    if (f) filterChips.push(`Flat: ${f.flat_number}`);
  }
  if (receiver !== "all") filterChips.push(`Receiver: ${receiver}`);

  return (
    <ReportShell
      title="Maintenance collection"
      subtitle="Monthly maintenance receipts — by flat, month and receiver."
      buildingName={buildingName}
      reportName="maintenance-collection"
      filename={`maintenance_${buildingName.replace(/\s+/g, "_")}`}
      dateRange={dateRange}
      setDateRange={setDateRange}
      extraFilters={extraFilters}
      filtersLine={filterChips.length ? filterChips.join(" · ") : undefined}
      columns={columns}
      visibleColumns={visibleColumns}
      enabledIds={enabledIds}
      setColumn={setColumn}
      rows={filtered}
      emptyText="No maintenance collected in this period."
    />
  );
}
