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

type CollectionRow = {
  id: string;
  payment_date: string;
  amount: number;
  payment_mode: string;
  category: string;
  receipt_no: string;
  flat_id: string;
  flat_number: string;
  resident_name: string;
  bank_account_id: string | null;
  received_by: string;
};

type BankAccount = { id: string; name: string; type: "cash" | "bank" };

const MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  online: "Online",
  cheque: "Cheque",
  credit_carryforward: "Credit carry-forward",
};

const CATEGORY_LABELS: Record<string, string> = {
  maintenance: "Maintenance",
  entry_fee: "Entry Fee",
  transfer_fee: "Transfer Fee",
  fine: "Fine",
  other: "Other",
  credit_carryforward: "Credit carry-forward",
};

export function OverallCollectionClient({
  buildingName,
  initialDateRange,
  rows,
  flats,
  bankAccounts,
  receivers,
}: {
  buildingName: string;
  initialDateRange: DateRange;
  rows: CollectionRow[];
  flats: { id: string; flat_number: string }[];
  bankAccounts: BankAccount[];
  receivers: string[];
}) {
  // URL-driven date range so the RSC parent can apply server-side
  // `gte / lte` on payment_date and keep the payload small.
  const [dateRange, setDateRange] = useReportDateRange(initialDateRange);
  const [category, setCategory] = useState<string>("all");
  const [flatId, setFlatId] = useState<string>("all");
  const [receiver, setReceiver] = useState<string>("all");

  const bankMap = useMemo(() => {
    const m = new Map<string, BankAccount>();
    for (const b of bankAccounts) m.set(b.id, b);
    return m;
  }, [bankAccounts]);

  type EnrichedRow = CollectionRow & {
    mode_label: string;
    bank_account_name: string;
    category_label: string;
  };

  const enriched: EnrichedRow[] = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        mode_label: MODE_LABELS[r.payment_mode] ?? r.payment_mode,
        bank_account_name: r.bank_account_id
          ? bankMap.get(r.bank_account_id)?.name ?? "—"
          : "—",
        category_label: CATEGORY_LABELS[r.category] ?? r.category,
      })),
    [rows, bankMap],
  );

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (r.payment_date < dateRange.from) return false;
      if (r.payment_date > dateRange.to) return false;
      if (category !== "all" && r.category !== category) return false;
      if (flatId !== "all" && r.flat_id !== flatId) return false;
      if (receiver !== "all" && r.received_by !== receiver) return false;
      return true;
    });
  }, [enriched, dateRange, category, flatId, receiver]);

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
        id: "category",
        label: "Category",
        defaultOn: true,
        accessor: (r) => r.category_label,
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
    "overall-collection",
    columns,
  );

  const extraFilters = (
    <>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Category
        </Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="min-w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Flat
        </Label>
        <Select value={flatId} onValueChange={setFlatId}>
          <SelectTrigger className="min-w-[120px]">
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
          <SelectTrigger className="min-w-[140px]">
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

  const chips: string[] = [];
  if (category !== "all")
    chips.push(`Category: ${CATEGORY_LABELS[category] ?? category}`);
  if (flatId !== "all") {
    const f = flats.find((x) => x.id === flatId);
    if (f) chips.push(`Flat: ${f.flat_number}`);
  }
  if (receiver !== "all") chips.push(`Receiver: ${receiver}`);

  return (
    <ReportShell
      title="Collections"
      subtitle="All incoming payments — maintenance, entry fees, transfer fees, fines and other income."
      buildingName={buildingName}
      reportName="overall-collection"
      filename={`overall-collection_${buildingName.replace(/\s+/g, "_")}`}
      dateRange={dateRange}
      setDateRange={setDateRange}
      extraFilters={extraFilters}
      filtersLine={chips.length ? chips.join(" · ") : undefined}
      columns={columns}
      visibleColumns={visibleColumns}
      enabledIds={enabledIds}
      setColumn={setColumn}
      rows={filtered}
      emptyText="No collections recorded in this period."
    />
  );
}
