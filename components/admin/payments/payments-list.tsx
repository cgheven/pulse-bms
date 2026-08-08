"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { deletePayment } from "@/app/actions/payments";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate, formatReceiptNo } from "@/lib/utils";
import { PAYMENT_MODE } from "@/types";

// User-friendly labels for payment modes. The DB stores raw enums
// (cash/bank/online/cheque/credit_carryforward); we render them as
// "Cash" / "Bank" / "Credit (carry-forward)" etc. so senior
// committee members instantly recognise what happened.
const MODE_LABEL: Record<string, string> = {
  [PAYMENT_MODE.CASH]: "Cash",
  [PAYMENT_MODE.BANK]: "Bank",
  [PAYMENT_MODE.ONLINE]: "Online",
  [PAYMENT_MODE.CHEQUE]: "Cheque",
  [PAYMENT_MODE.CREDIT_CARRYFORWARD]: "Credit (from earlier payment)",
};

export type PaymentRow = {
  id: string;
  payment_date: string | null;
  flat_id: string;
  flat_number: string;
  resident_name: string | null;
  amount: number;
  payment_mode: string | null;
  category: string | null;
  /** Per-building monotonic integer (e.g. 174 renders as "000174"). */
  receipt_no: number | null;
  /**
   * Pre-migration text receipt id (e.g. "RCPT-DEMO-PROJ-018"). Rendered
   * as a small subdued line under the new receipt_no so admins / union
   * staff can still find a row by its paper-book id during the
   * transition. Null on rows recorded post-migration.
   */
  legacy_receipt_no: string | null;
  recorded_by_name: string | null;
  reference_no: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  billing_month: string | null;
  /**
   * Snapshot of who physically received the cash for this payment.
   * Populated from `bms_payments.received_by_name` (admin/union) — null when
   * recorded by super_admin or for legacy rows pre-receiver feature.
   */
  received_by_name: string | null;
  /**
   * Committee position label at time of receipt (e.g. "President",
   * "Treasurer"). Denormalized so it survives committee changes.
   */
  received_by_position: string | null;
  /**
   * Groups every allocation row produced by ONE physical collection. A
   * resident paying six months at once produces six rows sharing this id;
   * the list renders them as the single payment they actually were.
   *
   * Optional: callers that synthesise rows (project contributions) omit it
   * and each row is treated as its own collection.
   */
  payment_group_id?: string | null;
};

/**
 * "Jan 2026" — a billing month has no meaningful day, and rendering one
 * ("01-Jan-2026") is noise in a column whose whole job is to say which month
 * the money was for. Ranges especially: "01-Jan-2026 – 01-Feb-2027" reads
 * like two dates rather than a span of months.
 */
function monthCell(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-PK", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** One physical collection: the rows it produced, folded into a single line. */
type Collection = {
  /** The row the receipt belongs to — the one carrying receipt_no. */
  anchor: PaymentRow;
  rows: PaymentRow[];
  total: number;
  /** Billing months covered, oldest first. Excludes rows with no invoice. */
  months: string[];
};

/**
 * Fold allocation rows into collections.
 *
 * A Rs. 30,000 advance settles ten months and therefore writes ten rows —
 * correct in the ledger, but listing them as ten payments of Rs. 3,000 reads
 * as ten separate handovers, and nine of them show a blank receipt column
 * because only the anchor carries a receipt number. One handover is one line.
 *
 * Order is preserved: a collection appears where its FIRST row appeared, so
 * the caller's sort (usually payment_date desc) still holds.
 */
function foldIntoCollections(rows: PaymentRow[]): Collection[] {
  const byGroup = new Map<string, Collection>();
  const order: string[] = [];

  for (const r of rows) {
    const key = r.payment_group_id ?? r.id;
    let c = byGroup.get(key);
    if (!c) {
      c = { anchor: r, rows: [], total: 0, months: [] };
      byGroup.set(key, c);
      order.push(key);
    }
    c.rows.push(r);
    c.total += Number(r.amount ?? 0);
    // The anchor is whichever row holds the receipt number; fall back to the
    // first row so a group that somehow has none still renders.
    if (r.receipt_no != null && c.anchor.receipt_no == null) c.anchor = r;
    if (r.billing_month) c.months.push(r.billing_month);
  }

  for (const c of byGroup.values()) {
    c.months.sort();
  }
  return order.map((k) => byGroup.get(k)!);
}

export function PaymentsList({
  payments,
  onFlatClick,
  receiptRoutePrefix = "/admin/payments",
  canDelete = false,
}: {
  payments: PaymentRow[];
  /**
   * Optional click handler for the flat number cell. When provided, the flat
   * number renders as a button that calls this handler (used by the union
   * collections page to pop a per-flat drilldown modal). When omitted, the
   * cell renders as a link to /admin/flats/<id> (the admin default).
   */
  onFlatClick?: (flat: { id: string; flat_number: string }) => void;
  /**
   * Base path for the per-row "Receipt" link. Defaults to the admin route;
   * union/collections passes "/union/payments" so officers land on the
   * union-scoped receipt route instead of the admin one.
   */
  receiptRoutePrefix?: string;
  /**
   * Show a per-row delete control. Off by default: the union collections view
   * lists payments officers may record but not reverse, and the server action
   * is admin/super_admin only — offering a button that always errors is worse
   * than not offering one.
   */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  // The collection queued for reversal, or null when the dialog is closed.
  const [confirming, setConfirming] = useState<Collection | null>(null);
  const [q, setQ] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");

  const months = useMemo(() => {
    const s = new Set<string>();
    for (const p of payments) {
      if (p.billing_month) s.add(p.billing_month.slice(0, 7));
    }
    return Array.from(s).sort().reverse();
  }, [payments]);

  // Per-row receipt rendering is delegated to the dedicated receipt route
  // (`<receiptRoutePrefix>/<id>/receipt`) — the user opens it in a new tab
  // and chooses Print or Download from there. We deliberately don't ship
  // a second PDF code path from this list so the layout stays canonical.

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    // Filters match a COLLECTION if any of its rows match. Filtering the raw
    // rows first would split a six-month advance into fragments — picking
    // "June" would show a lone Rs. 3,000 slice of a Rs. 30,000 receipt.
    return foldIntoCollections(payments).filter((c) => {
      if (
        monthFilter !== "all" &&
        !c.rows.some((p) => (p.billing_month ?? "").slice(0, 7) === monthFilter)
      )
        return false;
      if (modeFilter !== "all" && !c.rows.some((p) => p.payment_mode === modeFilter))
        return false;
      if (catFilter !== "all" && !c.rows.some((p) => p.category === catFilter))
        return false;
      if (s) {
        const receiptStr = formatReceiptNo(c.anchor.receipt_no).toLowerCase();
        const hit =
          c.anchor.flat_number.toLowerCase().includes(s) ||
          (c.anchor.resident_name ?? "").toLowerCase().includes(s) ||
          receiptStr.includes(s) ||
          c.rows.some((p) => (p.reference_no ?? "").toLowerCase().includes(s));
        if (!hit) return false;
      }
      return true;
    });
  }, [payments, q, monthFilter, modeFilter, catFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search receipt / flat / resident / ref..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Mode" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modes</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="bank">Bank</SelectItem>
            <SelectItem value={PAYMENT_MODE.CREDIT_CARRYFORWARD}>Credit carry-forward</SelectItem>
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="entry_fee">Entry fee</SelectItem>
            <SelectItem value="fine">Fine</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b border-border">
              <tr className="text-left">
                <th className="px-3 py-3 font-semibold">Flat</th>
                <th className="px-3 py-3 font-semibold">Date</th>
                <th className="px-3 py-3 font-semibold">For invoice</th>
                <th className="px-3 py-3 font-semibold">Mode</th>
                <th className="px-3 py-3 font-semibold text-right">Amount</th>
                <th className="px-3 py-3 font-semibold">Received by</th>
                <th className="px-3 py-3 font-semibold">Receipt #</th>
                <th className="px-3 py-3" />
                {canDelete && <th className="px-3 py-3" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canDelete ? 9 : 8} className="px-3 py-12 text-center text-muted-foreground">
                    No payments match the filters.
                  </td>
                </tr>
              )}
              {filtered.map((c) => {
                const p = c.anchor;
                return (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                  <td className="px-3 py-3 whitespace-nowrap">
                    {onFlatClick ? (
                      <button
                        type="button"
                        onClick={() =>
                          onFlatClick({ id: p.flat_id, flat_number: p.flat_number })
                        }
                        className="text-primary hover:underline tabular-nums font-semibold cursor-pointer"
                      >
                        {p.flat_number}
                      </button>
                    ) : (
                      <Link
                        href={`/admin/flats/${p.flat_id}`}
                        className="text-primary hover:underline tabular-nums font-semibold"
                      >
                        {p.flat_number}
                      </Link>
                    )}
                    {p.resident_name && (
                      <div className="text-xs text-muted-foreground mt-0.5 font-normal">{p.resident_name}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{p.payment_date ? formatDate(p.payment_date) : "—"}</td>
                  <td className="px-3 py-3 text-muted-foreground tabular-nums">
                    {c.months.length > 1 ? (
                      <div>
                        <div>
                          {monthCell(c.months[0])} – {monthCell(c.months[c.months.length - 1])}
                        </div>
                        <div className="text-xs text-muted-foreground/70 mt-0.5">
                          {c.months.length} months
                          {c.rows.length > c.months.length && " + advance"}
                        </div>
                      </div>
                    ) : c.months.length === 1 ? (
                      monthCell(c.months[0])
                    ) : p.category === "entry_fee" ? (
                      "Entry fee"
                    ) : c.rows.length > 0 ? (
                      "Held on account"
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {MODE_LABEL[p.payment_mode ?? ""] ?? p.payment_mode ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">{formatCurrency(c.total)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {p.received_by_name ? (
                      <div>
                        <div className="font-medium">{p.received_by_name}</div>
                        {p.received_by_position && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {p.received_by_position}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    <div>{formatReceiptNo(p.receipt_no) || "—"}</div>
                    {p.legacy_receipt_no && (
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5 font-normal normal-case">
                        Legacy: {p.legacy_receipt_no}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {p.receipt_no != null ? (
                      <Link
                        href={`${receiptRoutePrefix}/${p.id}/receipt`}
                        target="_blank"
                        rel="noopener"
                        className="text-primary hover:underline text-xs px-2 py-1 inline-block"
                        aria-label="Open printable receipt"
                      >
                        Receipt
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  {canDelete && (
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setConfirming(c)}
                        disabled={pending}
                        className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-40"
                        aria-label={`Reverse payment ${formatReceiptNo(p.receipt_no) || ""}`.trim()}
                        title="Reverse this payment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reversing a collection is not the same as deleting a row. One
          handover of six months' maintenance wrote six allocations and may
          have billed months ahead; undoing it takes all of that back. The
          dialog says so explicitly, because the operator clicked one line. */}
      <ConfirmDialog
        open={confirming !== null}
        title="Reverse this payment?"
        confirmLabel={pending ? "Reversing…" : "Reverse payment"}
        loading={pending}
        description={
          confirming
            ? [
                `This removes ${formatCurrency(confirming.total)} received from Flat ${confirming.anchor.flat_number}`,
                confirming.rows.length > 1
                  ? ` — all ${confirming.rows.length} months it settled, including any it billed ahead.`
                  : ".",
                " The flat's balance is recalculated. This cannot be undone.",
              ].join("")
            : ""
        }
        onCancel={() => !pending && setConfirming(null)}
        onConfirm={() => {
          const target = confirming;
          if (!target) return;
          startTransition(async () => {
            try {
              const res = await deletePayment(target.anchor.id);
              const removed = Array.isArray(res?.deleted_invoices)
                ? res.deleted_invoices.length
                : 0;
              const reopened = Array.isArray(res?.reopened_invoices)
                ? res.reopened_invoices.length
                : 0;
              const parts = [`${formatCurrency(target.total)} reversed`];
              if (removed > 0) parts.push(`${removed} month${removed > 1 ? "s" : ""} un-billed`);
              // A month funded by this advance goes back to unpaid — the
              // operator needs to know before a resident asks why.
              if (reopened > 0)
                parts.push(`${reopened} month${reopened > 1 ? "s" : ""} now unpaid again`);
              toast({ title: "Payment reversed", description: parts.join(" · ") });
              setConfirming(null);
              router.refresh();
            } catch (err) {
              toast({
                title: "Could not reverse payment",
                description: friendlyErrorMessage(err, "Please try again."),
                variant: "destructive",
              });
            }
          });
        }}
      />
    </div>
  );
}
