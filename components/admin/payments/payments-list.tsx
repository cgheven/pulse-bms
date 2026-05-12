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
import { Download, Plus } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadReceiptPdf } from "@/components/admin/billing/receipt-pdf";
import {
  RecordPaymentDialog,
  type FlatPickerOption,
} from "./record-payment-dialog";

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
  invoice_number: string | null;
  billing_month: string | null;
};

export function PaymentsList({
  payments,
  flats,
  buildingName,
}: {
  payments: PaymentRow[];
  flats: FlatPickerOption[];
  buildingName: string;
}) {
  const [q, setQ] = useState("");
  const [modeFilter, setModeFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

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
          <SelectTrigger className="w-44"><SelectValue placeholder="Mode" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modes</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="bank_transfer">Bank transfer</SelectItem>
            <SelectItem value="cheque">Cheque</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="other">Other</SelectItem>
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
        <div className="ml-auto">
          <Button className="btn-big" onClick={() => setAddOpen(true)}>
            <Plus className="w-5 h-5" />
            Record Payment
          </Button>
        </div>
        <RecordPaymentDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          flats={flats}
          buildingName={buildingName}
        />
      </div>

      <div className="card-soft p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Receipt</th>
                <th className="px-4 py-3 font-semibold">Flat</th>
                <th className="px-4 py-3 font-semibold">Resident</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Mode</th>
                <th className="px-4 py-3 font-semibold text-right">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    No payments match the filters.
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                  <td className="px-4 py-3">{p.payment_date ? formatDate(p.payment_date) : "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.receipt_no}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/flats/${p.flat_id}`} className="text-primary hover:underline">
                      {p.flat_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{p.resident_name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3">{p.category}</td>
                  <td className="px-4 py-3">{p.payment_mode}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(Number(p.amount))}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Download receipt"
                      onClick={() =>
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
                        })
                      }
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
