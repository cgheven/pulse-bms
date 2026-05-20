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
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadReceiptPdf } from "@/components/admin/billing/receipt-pdf";
import { createClient } from "@/lib/supabase/client";
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
  receipt_no: string | null;
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
  buildingName,
  buildingId,
  onFlatClick,
}: {
  payments: PaymentRow[];
  buildingName: string;
  buildingId: string;
  /**
   * Optional click handler for the flat number cell. When provided, the flat
   * number renders as a button that calls this handler (used by the union
   * collections page to pop a per-flat drilldown modal). When omitted, the
   * cell renders as a link to /admin/flats/<id> (the admin default).
   */
  onFlatClick?: (flat: { id: string; flat_number: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [modeFilter, setModeFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");

  // Fetch invoice total + total_paid_so_far ONLY for the row being clicked.
  // Avoids N+1 — the list view never preloads these. Filters are explicit
  // on building_id (defence in depth alongside RLS). When invoice_id is null
  // (entry_fee / fine / other), the receipt builder gracefully omits the
  // running-balance block.
  async function buildReceiptForRow(p: PaymentRow) {
    let invoice_amount: number | undefined;
    let total_paid_so_far: number | undefined;
    let still_due: number | undefined;

    if (p.invoice_id && p.payment_date) {
      const supabase = createClient();
      const [{ data: invRow }, { data: paidRows }] = await Promise.all([
        supabase
          .from("bms_invoices")
          .select("amount")
          .eq("id", p.invoice_id)
          .eq("building_id", buildingId)
          .single(),
        // Everything up to and including this chunk's date — the receipt
        // shows the running balance AT THE TIME of the chunk, not "as of now".
        supabase
          .from("bms_payments")
          .select("amount")
          .eq("invoice_id", p.invoice_id)
          .eq("building_id", buildingId)
          .lte("payment_date", p.payment_date),
      ]);
      if (invRow) invoice_amount = Number(invRow.amount);
      total_paid_so_far = (paidRows ?? []).reduce(
        (s, r) => s + Number((r as { amount: number }).amount ?? 0),
        0,
      );
      if (invoice_amount != null) {
        still_due = Math.max(0, invoice_amount - total_paid_so_far);
      }
    }

    downloadReceiptPdf({
      receipt_no: p.receipt_no ?? "",
      payment_date: p.payment_date,
      building_name: buildingName,
      flat_number: p.flat_number,
      resident_name: p.resident_name,
      amount: Number(p.amount),
      payment_mode: p.payment_mode,
      reference_no: p.reference_no,
      category: p.category,
      invoice_number: p.invoice_number,
      billing_month: p.billing_month,
      invoice_amount,
      total_paid_so_far,
      still_due,
      received_by_name: p.received_by_name,
      received_by_position: p.received_by_position,
    });
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return payments.filter((p) => {
      if (modeFilter !== "all" && p.payment_mode !== modeFilter) return false;
      if (catFilter !== "all" && p.category !== catFilter) return false;
      if (s) {
        if (
          !p.flat_number.toLowerCase().includes(s) &&
          !(p.resident_name ?? "").toLowerCase().includes(s) &&
          !(p.receipt_no ?? "").toLowerCase().includes(s) &&
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
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{p.receipt_no}</td>
                  <td className="px-3 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Download receipt"
                      onClick={() => {
                        void buildReceiptForRow(p);
                      }}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
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
