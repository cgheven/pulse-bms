"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MessageCircle,
  Receipt,
  FileText,
  FileSpreadsheet,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { cn, formatCurrency, formatDate, formatMonthLabel } from "@/lib/utils";
import { toIntlNoPlus } from "@/lib/phone";
import type { ReportColumn } from "@/lib/reports/types";
import { downloadReportXlsx } from "@/lib/reports/xlsx-export";
import { downloadReportPdf } from "@/lib/reports/pdf-export";
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

const STATUS_LABEL: Record<PayStatus, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
};

// Columns shared by the Excel and PDF exports — the same figures that are on
// screen. Numeric columns stay numbers so Excel can sum them.
const EXPORT_COLUMNS: ReportColumn<DefaulterRow>[] = [
  { id: "flat", label: "Flat", defaultOn: true, accessor: (r) => r.flat_number, widthMm: 22 },
  { id: "resident", label: "Resident", defaultOn: true, accessor: (r) => r.resident_name ?? "", widthMm: 45 },
  { id: "due_date", label: "Due date", defaultOn: true, accessor: (r) => (r.due_date ? formatDate(r.due_date) : "—"), widthMm: 28 },
  { id: "total", label: "Total", defaultOn: true, numeric: true, accessor: (r) => r.amount_total, widthMm: 26 },
  { id: "received", label: "Received", defaultOn: true, numeric: true, accessor: (r) => r.amount_paid, widthMm: 26 },
  { id: "due", label: "Due (balance)", defaultOn: true, numeric: true, accessor: (r) => Math.max(0, r.amount_due), widthMm: 30 },
  { id: "status", label: "Status", defaultOn: true, accessor: (r) => STATUS_LABEL[statusOf(r)], widthMm: 22 },
];

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
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [flatFilter, setFlatFilter] = useState("all");
  const [dueTodayOnly, setDueTodayOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [recordRow, setRecordRow] = useState<DefaulterRow | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);

  const counts = useMemo(() => {
    const c = { all: defaulters.length, paid: 0, unpaid: 0, partial: 0 };
    for (const d of defaulters) c[statusOf(d)] += 1;
    return c;
  }, [defaulters]);

  const dueTodayCount = useMemo(
    () => defaulters.filter((d) => d.due_date === todayStr && d.amount_due > 0).length,
    [defaulters, todayStr],
  );

  const flatOptions = useMemo(
    () =>
      Array.from(new Set(defaulters.map((d) => d.flat_number).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    [defaulters],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return defaulters.filter((d) => {
      if (filter !== "all" && statusOf(d) !== filter) return false;
      if (flatFilter !== "all" && d.flat_number !== flatFilter) return false;
      if (dueTodayOnly && !(d.due_date === todayStr && d.amount_due > 0)) return false;
      if (!q) return true;
      return (
        d.flat_number.toLowerCase().includes(q) ||
        (d.resident_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [defaulters, filter, flatFilter, dueTodayOnly, query, todayStr]);

  const totalDue = filtered.reduce((s, d) => s + Math.max(0, d.amount_due), 0);

  // Exports reflect the rows currently on screen.
  const periodLabel = month ? formatMonthLabel(month) : "All months";
  const exportFilename = `maintenance-${month ?? "all"}`;
  const runExport = async (fn: () => Promise<void>, what: string) => {
    try {
      await fn();
    } catch (err) {
      toast({
        title: `Could not export ${what}`,
        description: friendlyErrorMessage(err),
        variant: "destructive",
      });
    }
  };
  const exportExcel = () =>
    runExport(
      () =>
        downloadReportXlsx({
          filename: exportFilename,
          sheetName: "Maintenance",
          columns: EXPORT_COLUMNS,
          rows: filtered,
          totalsRow: true,
        }),
      "to Excel",
    );
  const exportPdf = () =>
    runExport(
      () =>
        downloadReportPdf({
          meta: {
            title: `Maintenance — ${periodLabel}`,
            buildingName,
            period: periodLabel,
            filename: exportFilename,
          },
          columns: EXPORT_COLUMNS,
          rows: filtered,
          totalsRow: true,
        }),
      "to PDF",
    );

  const changeMonth = (m: string) => {
    startTransition(() => {
      router.push(`/admin/maintenance?duesMonth=${m}`, { scroll: false });
    });
  };

  // availableMonths is newest-first, so the older month is the next index and
  // the newer month the previous one. Arrows disable at the ends.
  const monthIdx = month && availableMonths ? availableMonths.indexOf(month) : -1;
  const olderMonth =
    monthIdx >= 0 && availableMonths && monthIdx < availableMonths.length - 1
      ? availableMonths[monthIdx + 1]
      : null;
  const newerMonth =
    monthIdx > 0 && availableMonths ? availableMonths[monthIdx - 1] : null;

  return (
    <div className="card-soft space-y-4" aria-busy={isPending}>
      {/* Header: headline numbers on the left, month navigator on the right */}
      <div className="flex items-center justify-between gap-3">
        <div>
          {!month && <h3 className="font-semibold">Maintenance dues</h3>}
          <p className="text-sm text-muted-foreground">
            {counts.all} {counts.all === 1 ? "invoice" : "invoices"}
            {totalDue > 0 && <> · {formatCurrency(totalDue)} still due</>}
          </p>
        </div>
        {month && availableMonths && availableMonths.length > 0 && (
          <div className="inline-flex items-center rounded-lg border border-border bg-secondary/40 shrink-0 self-start">
            <button
              type="button"
              onClick={() => olderMonth && changeMonth(olderMonth)}
              disabled={!olderMonth}
              aria-label="Previous month"
              className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 min-w-[8.5rem] text-center text-sm font-medium tabular-nums">
              {formatMonthLabel(month)}
            </span>
            <button
              type="button"
              onClick={() => newerMonth && changeMonth(newerMonth)}
              disabled={!newerMonth}
              aria-label="Next month"
              className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* View switcher on the left, ledger link + exports on the right */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center rounded-lg bg-muted p-1">
          <ViewTab active={!dueTodayOnly} onClick={() => setDueTodayOnly(false)} icon={CalendarDays}>
            Monthly
          </ViewTab>
          <ViewTab
            active={dueTodayOnly}
            onClick={() => setDueTodayOnly(true)}
            icon={CalendarClock}
            count={dueTodayCount}
          >
            Due today
          </ViewTab>
        </div>

        <div className="flex items-center gap-2">
          {month && (
            <Link
              href="/admin/payments"
              className="inline-flex items-center gap-1.5 px-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">All payments</span>
            </Link>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={exportPdf}
            disabled={filtered.length === 0}
            className="h-9 gap-1.5"
          >
            <FileText className="w-4 h-4 text-destructive" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportExcel}
            disabled={filtered.length === 0}
            className="h-9 gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-[hsl(151_70%_55%)]" />
            Excel
          </Button>
        </div>
      </div>

      {/* Filters: status chips + flat picker on the left, search on the right */}
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

        {flatOptions.length > 0 && (
          <Select value={flatFilter} onValueChange={setFlatFilter}>
            <SelectTrigger className="h-9 w-full sm:w-36" aria-label="Filter by flat">
              <SelectValue placeholder="All flats" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All flats</SelectItem>
              {flatOptions.map((fn) => (
                <SelectItem key={fn} value={fn}>
                  {fn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Input
          placeholder="Search by flat or resident"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 sm:max-w-xs sm:ml-auto"
        />
      </div>

      {defaulters.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          No bills for {month ? formatMonthLabel(month) : "this period"}
          {month ? " — occupied flats are billed automatically each month." : "."}
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

function ViewTab({
  active,
  onClick,
  icon: Icon,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="w-4 h-4" />
      {children}
      {count != null && count > 0 && (
        <span
          className={cn(
            "inline-flex min-w-[1.25rem] justify-center rounded px-1 text-[11px] font-semibold tabular-nums",
            active ? "bg-destructive/15 text-destructive" : "bg-background/60 text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
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
