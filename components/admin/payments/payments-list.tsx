"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
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
// "Cash" / "Bank transfer" / "Credit (carry-forward)" etc. so senior
// committee members instantly recognise what happened.
const MODE_LABEL: Record<string, string> = {
  [PAYMENT_MODE.CASH]: "Cash",
  [PAYMENT_MODE.BANK]: "Bank transfer",
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
};

export function PaymentsList({
  payments,
  onFlatClick,
  receiptRoutePrefix = "/admin/payments",
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
}) {
  const [q, setQ] = useState("");
  const [modeFilter, setModeFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");

  // Per-row receipt rendering is delegated to the dedicated receipt route
  // (`<receiptRoutePrefix>/<id>/receipt`) — the user opens it in a new tab
  // and chooses Print or Download from there. We deliberately don't ship
  // a second PDF code path from this list so the layout stays canonical.

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return payments.filter((p) => {
      if (modeFilter !== "all" && p.payment_mode !== modeFilter) return false;
      if (catFilter !== "all" && p.category !== catFilter) return false;
      if (s) {
        const receiptStr = formatReceiptNo(p.receipt_no).toLowerCase();
        if (
          !p.flat_number.toLowerCase().includes(s) &&
          !(p.resident_name ?? "").toLowerCase().includes(s) &&
          !receiptStr.includes(s) &&
          !(p.reference_no ?? "").toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [payments, q, modeFilter, catFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search receipt / flat / resident / ref..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Mode" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modes</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="bank">Bank transfer</SelectItem>
            <SelectItem value="cheque">Cheque</SelectItem>
            <SelectItem value="online">Online</SelectItem>
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
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                    No payments match the filters.
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
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
                    {p.billing_month ? formatDate(p.billing_month) : (p.category === "entry_fee" ? "Entry fee" : "—")}
                  </td>
                  <td className="px-3 py-3">
                    {MODE_LABEL[p.payment_mode ?? ""] ?? p.payment_mode ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">{formatCurrency(Number(p.amount))}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
