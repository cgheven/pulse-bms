"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { recordPayment, type PaymentInput } from "@/app/actions/payments";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadReceiptPdf } from "@/components/admin/billing/receipt-pdf";
import { createClient } from "@/lib/supabase/client";

export type FlatPickerOption = {
  id: string;
  flat_number: string;
  outstanding_dues: number;
};

type PendingInv = {
  id: string;
  invoice_number: string;
  billing_month: string;
  amount: number;
  paid_total: number;
};

export function RecordPaymentDialog({
  trigger,
  flats,
  buildingName,
  presetInvoice,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  flats: FlatPickerOption[];
  buildingName: string;
  presetInvoice?: {
    invoice_id: string;
    flat_id: string;
    flat_number: string;
    invoice_number: string;
    billing_month: string;
    amount_due: number;
  };
  open?: boolean;
  onOpenChange?: (b: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [flat_id, setFlatId] = useState(presetInvoice?.flat_id ?? "");
  const [target, setTarget] = useState<string>(
    presetInvoice?.invoice_id ?? "entry_fee",
  );
  // target values:
  //   "<invoice_id>" => maintenance payment
  //   "entry_fee"   => entry fee
  //   "other"       => other
  const [amount, setAmount] = useState<string>(
    presetInvoice ? String(presetInvoice.amount_due) : "",
  );
  const [payment_date, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [payment_mode, setPaymentMode] = useState<
    "cash" | "bank_transfer" | "cheque" | "online" | "other"
  >("cash");
  const [reference_no, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [residentId, setResidentId] = useState<string>("");
  const [residents, setResidents] = useState<Array<{ id: string; full_name: string }>>([]);
  const [invoices, setInvoices] = useState<PendingInv[]>(
    presetInvoice
      ? [
          {
            id: presetInvoice.invoice_id,
            invoice_number: presetInvoice.invoice_number,
            billing_month: presetInvoice.billing_month,
            amount: presetInvoice.amount_due,
            paid_total: 0,
          },
        ]
      : [],
  );

  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  // load pending invoices + residents for chosen flat
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!flat_id) {
        setInvoices(
          presetInvoice
            ? [
                {
                  id: presetInvoice.invoice_id,
                  invoice_number: presetInvoice.invoice_number,
                  billing_month: presetInvoice.billing_month,
                  amount: presetInvoice.amount_due,
                  paid_total: 0,
                },
              ]
            : [],
        );
        setResidents([]);
        return;
      }
      const supabase = createClient();
      const [invQ, resQ] = await Promise.all([
        supabase
          .from("bms_invoices")
          .select("id, invoice_number, billing_month, amount, status")
          .eq("flat_id", flat_id)
          .in("status", ["pending", "partial", "overdue"])
          .order("billing_month", { ascending: true }),
        supabase
          .from("bms_residents")
          .select("id, full_name, is_primary")
          .eq("flat_id", flat_id)
          .eq("is_active", true)
          .order("is_primary", { ascending: false }),
      ]);

      // paid totals per invoice
      const invIds = (invQ.data ?? []).map((i) => i.id);
      const paidMap = new Map<string, number>();
      if (invIds.length) {
        const { data: pays } = await supabase
          .from("bms_payments")
          .select("invoice_id, amount")
          .in("invoice_id", invIds);
        for (const p of pays ?? []) {
          if (!p.invoice_id) continue;
          paidMap.set(p.invoice_id, (paidMap.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0));
        }
      }

      if (cancelled) return;
      const list: PendingInv[] = (invQ.data ?? []).map((i) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        billing_month: i.billing_month,
        amount: Number(i.amount),
        paid_total: paidMap.get(i.id) ?? 0,
      }));
      setInvoices(list);
      setResidents(resQ.data ?? []);
      if (resQ.data?.[0]?.id && !residentId) setResidentId(resQ.data[0].id);
    }
    load();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat_id]);

  const targetIsInvoice = useMemo(
    () => target !== "entry_fee" && target !== "other",
    [target],
  );

  const selectedFlat = flats.find((f) => f.id === flat_id);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flat_id) {
      toast({ title: "Pick a flat", variant: "destructive" });
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    start(async () => {
      try {
        const payload: PaymentInput = {
          flat_id,
          invoice_id: targetIsInvoice ? target : null,
          resident_id: residentId || null,
          amount: amt,
          payment_date,
          payment_mode,
          reference_no: reference_no || null,
          category:
            target === "entry_fee"
              ? "entry_fee"
              : target === "other"
              ? "other"
              : "maintenance",
          notes: notes || null,
        };
        const row = await recordPayment(payload);

        // Generate PDF receipt
        let invoice_number: string | null = null;
        let billing_month: string | null = null;
        if (targetIsInvoice) {
          const inv = invoices.find((i) => i.id === target);
          invoice_number = inv?.invoice_number ?? null;
          billing_month = inv?.billing_month ?? null;
        }
        const residentName = residents.find((r) => r.id === residentId)?.full_name ?? null;

        downloadReceiptPdf({
          receipt_no: row.receipt_no,
          payment_date: row.payment_date,
          building_name: buildingName,
          flat_number: selectedFlat?.flat_number ?? "—",
          resident_name: residentName,
          amount: Number(row.amount),
          payment_mode: row.payment_mode,
          reference_no: row.reference_no,
          category: row.category,
          invoice_number,
          billing_month,
        });

        toast({
          title: "Payment recorded",
          description: `Receipt ${row.receipt_no} downloaded.`,
        });
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Error",
          description:
            err instanceof Error ? err.message : "Could not record payment",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Flat *</Label>
            <Select value={flat_id} onValueChange={setFlatId} disabled={!!presetInvoice}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a flat" />
              </SelectTrigger>
              <SelectContent>
                {flats.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.flat_number}
                    {f.outstanding_dues > 0
                      ? ` — dues ${formatCurrency(f.outstanding_dues)}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label>Resident</Label>
            <Select value={residentId} onValueChange={setResidentId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick resident (optional)" />
              </SelectTrigger>
              <SelectContent>
                {residents.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label>Pay against</Label>
            <Select value={target} onValueChange={(v) => {
              setTarget(v);
              if (v !== "entry_fee" && v !== "other") {
                const inv = invoices.find((i) => i.id === v);
                if (inv) setAmount(String(Math.max(0, inv.amount - inv.paid_total)));
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Pick invoice or category" />
              </SelectTrigger>
              <SelectContent>
                {invoices.map((inv) => {
                  const remaining = Math.max(0, inv.amount - inv.paid_total);
                  return (
                    <SelectItem key={inv.id} value={inv.id}>
                      {formatDate(inv.billing_month)} — {inv.invoice_number} (
                      {formatCurrency(remaining)} due)
                    </SelectItem>
                  );
                })}
                <SelectItem value="entry_fee">Entry fee</SelectItem>
                <SelectItem value="other">Other / miscellaneous</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Amount (PKR) *</Label>
            <Input
              type="number"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={payment_date}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          <div>
            <Label>Payment mode</Label>
            <Select
              value={payment_mode}
              onValueChange={(v) =>
                setPaymentMode(v as "cash" | "bank_transfer" | "cheque" | "online" | "other")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reference #</Label>
            <Input
              value={reference_no}
              onChange={(e) => setRef(e.target.value)}
              placeholder="Cheque or txn number"
            />
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter className="col-span-2 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Record & download receipt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
