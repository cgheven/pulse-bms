"use client";

import { useMemo, useState } from "react";
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
import { Receipt } from "lucide-react";
import { InvoiceStatusPill } from "./invoice-status-pill";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  RecordPaymentDialog,
  type FlatPickerOption,
} from "@/components/admin/payments/record-payment-dialog";

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  flat_id: string;
  flat_number: string;
  billing_month: string;
  amount: number;
  status: string;
  due_date: string | null;
  paid_total: number;
};

export function InvoicesList({
  invoices,
  buildingName,
  flatPickerOptions,
}: {
  invoices: InvoiceRow[];
  buildingName: string;
  flatPickerOptions: FlatPickerOption[];
}) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [flatFilter, setFlatFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [payInvoice, setPayInvoice] = useState<InvoiceRow | null>(null);

  const months = useMemo(() => {
    const s = new Set<string>();
    for (const i of invoices) s.add(i.billing_month.slice(0, 7));
    return Array.from(s).sort().reverse();
  }, [invoices]);

  const flats = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of invoices) map.set(i.flat_id, i.flat_number);
    return Array.from(map.entries()).map(([id, num]) => ({ id, flat_number: num }));
  }, [invoices]);

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (flatFilter !== "all" && i.flat_id !== flatFilter) return false;
      if (monthFilter !== "all" && i.billing_month.slice(0, 7) !== monthFilter) return false;
      if (statusFilter !== "all") {
        const eff =
          i.status === "pending" && i.due_date && i.due_date < today ? "overdue" : i.status;
        if (eff !== statusFilter) return false;
      }
      if (q) {
        const s = q.trim().toLowerCase();
        if (
          !i.invoice_number.toLowerCase().includes(s) &&
          !i.flat_number.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [invoices, statusFilter, monthFilter, flatFilter, q, today]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search invoice # / flat..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="waived">Waived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={flatFilter} onValueChange={setFlatFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Flat" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All flats</SelectItem>
            {flats.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.flat_number}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b border-border">
              <tr className="text-left">
                <th className="px-3 py-3 font-semibold">Flat</th>
                <th className="px-3 py-3 font-semibold">Month</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                <th className="px-4 py-3 font-semibold text-right">Amount</th>
                <th className="px-4 py-3 font-semibold text-right">Paid</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Invoice #</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    No invoices match the filters.
                  </td>
                </tr>
              )}
              {filtered.map((inv) => {
                const remaining = Math.max(0, Number(inv.amount) - Number(inv.paid_total));
                return (
                  <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <Link href={`/admin/flats/${inv.flat_id}`} className="text-primary hover:underline tabular-nums font-semibold">
                        {inv.flat_number}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{formatDate(inv.billing_month)}</td>
                    <td className="px-4 py-3">{inv.due_date ? formatDate(inv.due_date) : "—"}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(Number(inv.amount))}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(Number(inv.paid_total))}</td>
                    <td className="px-4 py-3">
                      <InvoiceStatusPill status={inv.status} due_date={inv.due_date} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {remaining > 0 && inv.status !== "waived" ? (
                        <Button size="sm" variant="outline" onClick={() => setPayInvoice(inv)}>
                          <Receipt className="w-4 h-4" />
                          Record payment
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {payInvoice && (
        <RecordPaymentDialog
          open={!!payInvoice}
          onOpenChange={(b) => !b && setPayInvoice(null)}
          flats={flatPickerOptions}
          buildingName={buildingName}
          presetInvoice={{
            invoice_id: payInvoice.id,
            flat_id: payInvoice.flat_id,
            flat_number: payInvoice.flat_number,
            invoice_number: payInvoice.invoice_number,
            billing_month: payInvoice.billing_month,
            amount_due: Math.max(0, Number(payInvoice.amount) - Number(payInvoice.paid_total)),
          }}
        />
      )}
    </div>
  );
}
