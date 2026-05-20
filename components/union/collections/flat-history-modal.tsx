"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toIntlNoPlus } from "@/lib/phone";
import { PAYMENT_MODE } from "@/types";
import { PaymentsList, type PaymentRow } from "@/components/admin/payments/payments-list";

const MODE_LABEL: Record<string, string> = {
  [PAYMENT_MODE.CASH]: "Cash",
  [PAYMENT_MODE.BANK]: "Bank transfer",
  [PAYMENT_MODE.ONLINE]: "Online",
  [PAYMENT_MODE.CHEQUE]: "Cheque",
  [PAYMENT_MODE.CREDIT_CARRYFORWARD]: "Credit carry-forward",
};

type Invoice = {
  id: string;
  invoice_number: string;
  billing_month: string;
  amount: number;
  status: string | null;
  due_date: string | null;
  paid_total: number;
};

type Payment = {
  id: string;
  payment_date: string | null;
  amount: number;
  payment_mode: string | null;
  reference_no: string | null;
  receipt_no: string | null;
  received_by_name: string | null;
  received_by_position: string | null;
};

type Resident = {
  full_name: string;
  phone: string | null;
};

/**
 * Per-flat drilldown opened from /union/collections.
 *
 * Loads three things lazily ONLY when the dialog opens so the parent page
 * stays cheap on initial render:
 *   1. Primary resident (name + phone) for the WhatsApp reminder template
 *   2. Last 12 months of invoices (each with status pill + paid total)
 *   3. Last 50 payments (with the new received_by snapshot)
 *
 * All reads are explicitly building-scoped — defence-in-depth alongside
 * the existing RLS that already restricts a union member's reads to
 * their own building.
 */
export function FlatHistoryModal({
  open,
  onOpenChange,
  flatId,
  flatNumber,
  buildingId,
  buildingName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flatId: string | null;
  flatNumber: string | null;
  buildingId: string;
  buildingName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [resident, setResident] = useState<Resident | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!open || !flatId) return;
      setLoading(true);
      try {
        const supabase = createClient();

        // Cutoff for "last 12 months" of invoices — anchored to today's
        // billing_month so a flat with a long quiet stretch still shows
        // recent activity rather than zero rows.
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - 12);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        const [
          { data: residentRow },
          { data: invRows },
          { data: payRows },
        ] = await Promise.all([
          supabase
            .from("bms_residents")
            .select("full_name, phone")
            .eq("building_id", buildingId)
            .eq("flat_id", flatId)
            .eq("is_active", true)
            .eq("is_primary", true)
            .limit(1)
            .maybeSingle(),
          supabase
            .from("bms_invoices")
            .select("id, invoice_number, billing_month, amount, status, due_date")
            .eq("building_id", buildingId)
            .eq("flat_id", flatId)
            .gte("billing_month", cutoffStr)
            .order("billing_month", { ascending: false }),
          supabase
            .from("bms_payments")
            .select(
              "id, payment_date, amount, payment_mode, reference_no, receipt_no, received_by_name, received_by_position, invoice_id",
            )
            .eq("building_id", buildingId)
            .eq("flat_id", flatId)
            .order("payment_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(50),
        ]);

        // Compute paid_total per invoice in-memory from the same payments
        // we just loaded. This is sufficient because we cap at 50 payments
        // and 12 months of invoices — both bounded.
        type PayRow = { invoice_id: string | null; amount: number };
        const paidByInv = new Map<string, number>();
        for (const p of ((payRows ?? []) as PayRow[])) {
          if (!p.invoice_id) continue;
          paidByInv.set(
            p.invoice_id,
            (paidByInv.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0),
          );
        }

        if (cancelled) return;
        setResident(residentRow ?? null);
        setInvoices(
          (invRows ?? []).map((i) => ({
            id: i.id,
            invoice_number: i.invoice_number,
            billing_month: i.billing_month,
            amount: Number(i.amount ?? 0),
            status: i.status,
            due_date: i.due_date,
            paid_total: paidByInv.get(i.id) ?? 0,
          })),
        );
        setPayments(
          (payRows ?? []).map((p) => ({
            id: p.id,
            payment_date: p.payment_date,
            amount: Number(p.amount ?? 0),
            payment_mode: p.payment_mode,
            reference_no: p.reference_no,
            receipt_no: p.receipt_no,
            received_by_name: p.received_by_name,
            received_by_position: p.received_by_position,
          })),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, flatId, buildingId]);

  // Reset state when the modal closes so re-opening on a different flat
  // doesn't briefly flash stale rows from the previous flat.
  useEffect(() => {
    if (!open) {
      setResident(null);
      setInvoices([]);
      setPayments([]);
    }
  }, [open]);

  // Aggregate "amount still due" for the WhatsApp reminder. Uses ALL open
  // invoices in the window (not just one row) so the message reflects the
  // current owed total.
  const totalDue = invoices.reduce(
    (s, i) => s + Math.max(0, i.amount - i.paid_total),
    0,
  );
  const intl = toIntlNoPlus(resident?.phone ?? null);
  const greeting = resident?.full_name
    ? `Asalam-o-Alaikum ${resident.full_name},`
    : "Asalam-o-Alaikum,";
  const waText = [
    greeting,
    "",
    totalDue > 0
      ? `Aap ki maintenance ke Rs. ${totalDue.toLocaleString("en-PK")} abhi tak baqi hain.`
      : "Aap ki maintenance up-to-date hai. Shukriya!",
    "",
    "Shukriya.",
    `— ${buildingName} Committee`,
  ].join("\n");
  const waHref = intl
    ? `https://wa.me/${intl}?text=${encodeURIComponent(waText)}`
    : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Flat {flatNumber ?? "—"}
            {resident?.full_name && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {resident.full_name}
                {resident.phone ? ` · ${resident.phone}` : ""}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground">Loading history…</p>
        ) : (
          <div className="space-y-6">
            {/* WhatsApp reminder (parity with defaulters panel) */}
            <div className="flex flex-wrap gap-2">
              {intl ? (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold text-white bg-[hsl(151_70%_28%)] hover:bg-[hsl(151_70%_24%)] transition"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp reminder
                </a>
              ) : (
                <span className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm text-muted-foreground bg-muted">
                  <MessageCircle className="h-4 w-4" />
                  No phone on file
                </span>
              )}
            </div>

            {/* Invoices */}
            <section>
              <h3 className="font-semibold mb-2">Invoices — last 12 months</h3>
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No invoices in this window.
                </p>
              ) : (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Month</th>
                        <th className="px-3 py-2 font-medium">Invoice #</th>
                        <th className="px-3 py-2 font-medium text-right">Amount</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((i) => {
                        const stillDue = Math.max(0, i.amount - i.paid_total);
                        return (
                          <tr key={i.id} className="border-t border-border">
                            <td className="px-3 py-2 tabular-nums">
                              {formatDate(i.billing_month)}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                              {i.invoice_number}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatCurrency(i.amount)}
                            </td>
                            <td className="px-3 py-2">
                              {stillDue <= 0 ? (
                                <span className="text-[hsl(151_70%_28%)] font-semibold">
                                  Cleared
                                </span>
                              ) : (
                                <span className="text-destructive font-semibold">
                                  {formatCurrency(stillDue)} due
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Payments */}
            <section>
              <h3 className="font-semibold mb-2">
                Payments — last {payments.length} entries
              </h3>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payments recorded for this flat yet.
                </p>
              ) : (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium text-right">Amount</th>
                        <th className="px-3 py-2 font-medium">Mode</th>
                        <th className="px-3 py-2 font-medium">Received by</th>
                        <th className="px-3 py-2 font-medium">Receipt #</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} className="border-t border-border">
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                            {p.payment_date ? formatDate(p.payment_date) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">
                            {formatCurrency(p.amount)}
                          </td>
                          <td className="px-3 py-2">
                            {MODE_LABEL[p.payment_mode ?? ""] ?? p.payment_mode ?? "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {p.received_by_name ? (
                              <div>
                                <div className="font-medium">
                                  {p.received_by_name}
                                </div>
                                {p.received_by_position && (
                                  <div className="text-xs text-muted-foreground">
                                    {p.received_by_position}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {p.receipt_no ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tiny client wrapper that injects the flat-history modal alongside a
 * PaymentsList. Server component renders this with the table props; the
 * client manages selected-flat state and modal open/close.
 */
export function UnionRecentPaymentsTable({
  payments,
  buildingName,
  buildingId,
}: {
  payments: PaymentRow[];
  buildingName: string;
  buildingId: string;
}) {
  const [selected, setSelected] = useState<{ id: string; flat_number: string } | null>(
    null,
  );
  return (
    <>
      <PaymentsList
        payments={payments}
        buildingName={buildingName}
        buildingId={buildingId}
        onFlatClick={(flat) => setSelected(flat)}
      />
      <FlatHistoryModal
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
        flatId={selected?.id ?? null}
        flatNumber={selected?.flat_number ?? null}
        buildingId={buildingId}
        buildingName={buildingName}
      />
    </>
  );
}

