"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Receipt, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn, formatCurrency, formatDate, formatMonthLabel } from "@/lib/utils";
import { toIntlNoPlus } from "@/lib/phone";
import {
  RecordPaymentDialog,
  type FlatPickerOption,
} from "@/components/admin/payments/record-payment-dialog";

export type DefaulterRow = {
  invoice_id: string;
  invoice_number: string;
  flat_id: string;
  flat_number: string;
  resident_id: string | null;
  resident_name: string | null;
  resident_phone: string | null;
  billing_month: string;
  due_date: string | null;
  amount_total: number;
  amount_paid: number;
  amount_due: number;
  days_late: number;
  /** Payment id to open a receipt for (null when nothing has been paid). */
  receipt_payment_id: string | null;
};

type PayStatus = "paid" | "partial" | "unpaid";
type Filter = "all" | PayStatus;

/** The single source of truth for a row's payment state. */
function statusOf(d: DefaulterRow): PayStatus {
  if (d.amount_due <= 0) return "paid";
  if (d.amount_paid > 0) return "partial";
  return "unpaid";
}

export function DuesDefaultersPanel({
  defaulters,
  buildingName,
  buildingId,
  flatPickerOptions = [],
  month,
  availableMonths,
}: {
  defaulters: DefaulterRow[];
  buildingName: string;
  buildingId?: string;
  flatPickerOptions?: FlatPickerOption[];
  /** Scoped month, "YYYY-MM". Omit for the all-months (legacy) view. */
  month?: string;
  /** Months (newest first) the selector offers. Omit to hide the selector. */
  availableMonths?: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [recordRow, setRecordRow] = useState<DefaulterRow | null>(null);

  const counts = useMemo(() => {
    const c = { all: defaulters.length, paid: 0, unpaid: 0, partial: 0 };
    for (const d of defaulters) c[statusOf(d)] += 1;
    return c;
  }, [defaulters]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return defaulters.filter((d) => {
      if (filter !== "all" && statusOf(d) !== filter) return false;
      if (!q) return true;
      return (
        d.flat_number.toLowerCase().includes(q) ||
        (d.resident_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [defaulters, filter, query]);

  const totalDue = filtered.reduce((s, d) => s + Math.max(0, d.amount_due), 0);

  const changeMonth = (m: string) => {
    startTransition(() => {
      router.push(`/admin/maintenance?duesMonth=${m}`, { scroll: false });
    });
  };

  return (
    <div className="card-soft space-y-4" aria-busy={isPending}>
      {/* Header: month + headline numbers, with the month navigator */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {month ? `Maintenance — ${formatMonthLabel(month)}` : "Maintenance dues"}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {counts.all} {counts.all === 1 ? "invoice" : "invoices"}
            {totalDue > 0 && <> · {formatCurrency(totalDue)} still due</>}
          </p>
        </div>
        {month && availableMonths && availableMonths.length > 0 && (
          <Select value={month} onValueChange={changeMonth}>
            <SelectTrigger className="h-9 w-full sm:w-44 shrink-0" aria-label="Month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Status filters with live counts + search */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="inline-flex flex-wrap gap-1 rounded-md bg-muted p-1">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} count={counts.all}>
            All
          </FilterChip>
          <FilterChip active={filter === "paid"} onClick={() => setFilter("paid")} count={counts.paid} tone="paid">
            Paid
          </FilterChip>
          <FilterChip active={filter === "unpaid"} onClick={() => setFilter("unpaid")} count={counts.unpaid} tone="unpaid">
            Unpaid
          </FilterChip>
          <FilterChip active={filter === "partial"} onClick={() => setFilter("partial")} count={counts.partial} tone="partial">
            Partial
          </FilterChip>
        </div>
        <Input
          placeholder="Search by flat or resident"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 sm:max-w-xs sm:ml-auto"
        />
        <Link
          href="/admin/payments"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline shrink-0 whitespace-nowrap"
        >
          <FileText className="w-3.5 h-3.5" />
          All payments
        </Link>
      </div>

      {defaulters.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No invoices for {month ? formatMonthLabel(month) : "this period"}.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No flats match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 sm:px-2 py-2">Flat</th>
                <th className="px-4 sm:px-2 py-2 text-right">Total</th>
                <th className="px-4 sm:px-2 py-2 text-right hidden sm:table-cell">Received</th>
                <th className="px-4 sm:px-2 py-2 text-right">Still due</th>
                <th className="px-4 sm:px-2 py-2">Status</th>
                <th className="px-4 sm:px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <DefaulterRowCard
                  key={d.invoice_id}
                  row={d}
                  buildingName={buildingName}
                  onRecord={buildingId && d.amount_due > 0 ? () => setRecordRow(d) : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recordRow && buildingId && (
        <RecordPaymentDialog
          open={!!recordRow}
          onOpenChange={(b) => !b && setRecordRow(null)}
          flats={flatPickerOptions}
          buildingName={buildingName}
          buildingId={buildingId}
          presetInvoice={{
            invoice_id: recordRow.invoice_id,
            flat_id: recordRow.flat_id,
            flat_number: recordRow.flat_number,
            invoice_number: recordRow.invoice_number,
            billing_month: recordRow.billing_month,
            amount_due: recordRow.amount_due,
            resident_id: recordRow.resident_id,
            resident_name: recordRow.resident_name,
          }}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  tone?: PayStatus;
  children: React.ReactNode;
}) {
  const countTone = active
    ? "bg-background/20"
    : tone === "paid"
      ? "bg-[hsl(151_70%_55%/0.15)] text-[hsl(151_70%_55%)]"
      : tone === "partial"
        ? "bg-info/15 text-info"
        : tone === "unpaid"
          ? "bg-destructive/15 text-destructive"
          : "bg-background/60 text-muted-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      <span className={cn("inline-flex min-w-[1.25rem] justify-center rounded px-1 text-[11px] tabular-nums", countTone)}>
        {count}
      </span>
    </button>
  );
}

function StatusBadge({ row }: { row: DefaulterRow }) {
  const s = statusOf(row);
  if (s === "paid") {
    return <span className="status-paid inline-flex px-2 py-0.5 rounded-full text-xs font-medium">Paid</span>;
  }
  if (s === "partial") {
    return <span className="status-info inline-flex px-2 py-0.5 rounded-full text-xs font-medium">Partial</span>;
  }
  return row.days_late > 0 ? (
    <span className="status-overdue inline-flex px-2 py-0.5 rounded-full text-xs font-medium">
      {row.days_late}d late
    </span>
  ) : (
    <span className="status-pending inline-flex px-2 py-0.5 rounded-full text-xs font-medium">Pending</span>
  );
}

function DefaulterRowCard({
  row,
  buildingName,
  onRecord,
}: {
  row: DefaulterRow;
  buildingName: string;
  onRecord?: () => void;
}) {
  const intl = toIntlNoPlus(row.resident_phone);
  const monthLabel = new Date(row.billing_month).toLocaleDateString("en-PK", {
    month: "long",
    year: "numeric",
  });

  // Roman-Urdu gap-aware reminder. Personalised per resident, includes the
  // already-paid amount so it can't be misread as "you owe the full month".
  const paidNote =
    row.amount_paid > 0
      ? `Rs. ${row.amount_paid.toLocaleString("en-PK")} mil chuke hain, total Rs. ${row.amount_total.toLocaleString("en-PK")}.`
      : `Total Rs. ${row.amount_total.toLocaleString("en-PK")}.`;
  const greeting = row.resident_name ? `Asalam-o-Alaikum ${row.resident_name},` : "Asalam-o-Alaikum,";
  const waText = [
    greeting,
    "",
    `Aap ki ${monthLabel} maintenance ke Rs. ${row.amount_due.toLocaleString("en-PK")} abhi tak baqi hain.`,
    paidNote,
    "",
    "Shukriya.",
    `— ${buildingName} Admin`,
  ].join("\n");

  const waHref = intl
    ? `https://wa.me/${intl}?text=${encodeURIComponent(waText)}`
    : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  const hasDue = row.amount_due > 0;

  return (
    <tr className="border-b border-border last:border-0 hover:bg-secondary/40">
      <td className="px-4 sm:px-2 py-2.5 align-top">
        <div className="font-semibold">{row.flat_number}</div>
        <div className="text-xs text-muted-foreground">
          {row.resident_name ?? "No resident"}
        </div>
      </td>
      <td className="px-4 sm:px-2 py-2.5 align-top text-right tabular-nums">
        {formatCurrency(row.amount_total)}
      </td>
      <td className="px-4 sm:px-2 py-2.5 align-top text-right tabular-nums hidden sm:table-cell text-muted-foreground">
        {row.amount_paid > 0 ? formatCurrency(row.amount_paid) : "—"}
      </td>
      <td className="px-4 sm:px-2 py-2.5 align-top text-right tabular-nums">
        {hasDue ? (
          <span className="font-semibold text-destructive">{formatCurrency(row.amount_due)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 sm:px-2 py-2.5 align-top">
        <StatusBadge row={row} />
      </td>
      <td className="px-4 sm:px-2 py-2.5 align-top">
        <div className="flex flex-col sm:flex-row gap-1.5 justify-end">
          {row.amount_paid > 0 && row.receipt_payment_id && (
            <Link
              href={`/admin/payments/${row.receipt_payment_id}/receipt`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-input hover:bg-accent transition"
              title="View / download receipt"
            >
              <Receipt className="h-3.5 w-3.5" />
              Receipt
            </Link>
          )}
          {hasDue &&
            (intl ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[hsl(151_70%_38%)] hover:bg-[hsl(151_70%_32%)] transition"
                title={`Send reminder to ${row.resident_name ?? "resident"}`}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </a>
            ) : (
              <span
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground bg-muted"
                title="No phone number on file"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                No phone
              </span>
            ))}
          {onRecord && (
            <Button variant="outline" size="sm" onClick={onRecord}>
              <Receipt className="h-3.5 w-3.5" />
              Record
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
