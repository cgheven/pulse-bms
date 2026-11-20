"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  MessageCircle,
  Receipt,
  FileText,
  FileSpreadsheet,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Phone,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { cn, formatCurrency, formatDate, formatMonthLabel, formatPhone } from "@/lib/utils";
import { toIntlNoPlus } from "@/lib/phone";
import type { ReportColumn } from "@/lib/reports/types";
import { downloadReportXlsx } from "@/lib/reports/xlsx-export";
import { downloadReportPdf } from "@/lib/reports/pdf-export";
import {
  RecordPaymentDialog,
  type FlatPickerOption,
} from "@/components/admin/payments/record-payment-dialog";
import { InvoicePreviewDialog } from "@/components/payments/invoice-preview-dialog";

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
}: {
  defaulters: DefaulterRow[];
  buildingName: string;
  buildingId?: string;
  flatPickerOptions?: FlatPickerOption[];
  /** Scoped month, "YYYY-MM". Omit for the all-months (legacy) view. */
  month?: string;
}) {
  const { toast } = useToast();
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

  return (
    <div className="space-y-3">
      {/* View switcher on the left, ledger link + exports on the right */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-sidebar-border bg-white/5 p-1">
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

      {/* Table card — filters + list, kept separate from the view bar above */}
      <div className="card-soft space-y-4">
        {/* Filters: status chips + flat picker on the left, search on the right */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="flex flex-wrap items-center gap-1">
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
                <th className="px-4 sm:px-2 py-2">Resident</th>
                <th className="px-4 sm:px-2 py-2">Phone</th>
                <th className="px-4 sm:px-2 py-2 text-right">Total</th>
                <th className="px-4 sm:px-2 py-2 text-right hidden sm:table-cell">Received</th>
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
      </div>

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
  // Matches HMS TabsTrigger: text-xs, small icon, active lifts to a card chip.
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
      {count != null && count > 0 && (
        <span className="ml-1 rounded-full bg-amber/20 px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-amber">
          {count}
        </span>
      )}
    </button>
  );
}

// Matches HMS chipClass: borderless rounded-full pills, tinted only when
// active, with a dimmed count — no segmented container, no colored badges.
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
  const activeCls =
    tone === "paid"
      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
      : tone === "unpaid"
        ? "bg-amber/15 border-amber/40 text-amber"
        : tone === "partial"
          ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
          : "bg-primary border-primary text-primary-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 px-3 rounded-full text-xs font-medium border transition-all",
        active
          ? activeCls
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-sidebar-border",
      )}
    >
      {children} <span className="ml-1 opacity-60 tabular-nums">{count}</span>
    </button>
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
  const [previewOpen, setPreviewOpen] = useState(false);
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
      <td className="px-4 sm:px-2 py-2.5 align-top font-semibold whitespace-nowrap">
        {row.flat_number}
      </td>
      <td className="px-4 sm:px-2 py-2.5 align-top">
        {row.resident_name ?? <span className="text-muted-foreground">No resident</span>}
      </td>
      <td className="px-4 sm:px-2 py-2.5 align-top whitespace-nowrap">
        {row.resident_phone ? (
          <a
            href={`tel:${row.resident_phone.replace(/[^\d+]/g, "")}`}
            className="inline-flex items-center gap-1.5 text-primary hover:underline tabular-nums"
            title={`Call ${row.resident_name ?? "resident"}`}
          >
            <Phone className="h-3 w-3 shrink-0" />
            {formatPhone(row.resident_phone)}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 sm:px-2 py-2.5 align-top text-right tabular-nums">
        {formatCurrency(row.amount_total)}
      </td>
      <td className="px-4 sm:px-2 py-2.5 align-top text-right tabular-nums hidden sm:table-cell text-muted-foreground">
        {row.amount_paid > 0 ? formatCurrency(row.amount_paid) : "—"}
      </td>
      <td className="px-4 sm:px-2 py-2.5 align-top">
        <div className="flex flex-col sm:flex-row gap-1.5 justify-end">
          {row.amount_paid > 0 && row.receipt_payment_id && (
            <Link
              href={`/admin/payments/${row.receipt_payment_id}/receipt`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center justify-center gap-1.5 shrink-0 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="View / download receipt"
            >
              <Receipt className="h-3 w-3" />
              Receipt
            </Link>
          )}
          {hasDue &&
            (intl ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center justify-center gap-1.5 shrink-0 rounded-md border border-[#25D366]/25 px-3 text-xs font-medium text-[#25D366] hover:text-[#25D366] hover:bg-[#25D366]/10 hover:border-[#25D366]/50 transition-colors"
                title={`Send reminder to ${row.resident_name ?? "resident"}`}
              >
                <MessageCircle className="h-3 w-3" />
                Remind
              </a>
            ) : (
              <span
                className="inline-flex h-8 items-center justify-center gap-1.5 shrink-0 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground"
                title="No phone number on file"
              >
                <MessageCircle className="h-3 w-3" />
                No phone
              </span>
            ))}
          {onRecord && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRecord}
              className="h-8 px-3 text-xs gap-1.5 shrink-0 text-emerald-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40"
            >
              <CheckCircle2 className="h-3 w-3" />
              Pay
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                title="More"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                className="gap-2"
                onSelect={(e) => {
                  e.preventDefault();
                  setPreviewOpen(true);
                }}
              >
                <FileText className="h-4 w-4" />
                Preview Invoice
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <InvoicePreviewDialog
            invoiceId={row.invoice_id}
            subtitle={`${row.resident_name ?? row.flat_number} · ${String(row.billing_month).slice(0, 7)}`}
            open={previewOpen}
            onOpenChange={setPreviewOpen}
          />
        </div>
      </td>
    </tr>
  );
}
