"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import { paySalary } from "@/app/actions/staff";
import { Download } from "lucide-react";

type Payment = {
  id: string;
  pay_month: string; // YYYY-MM-01
  amount: number;
  payment_date: string | null;
  payment_mode: string | null;
  slip_no: string | null;
  notes: string | null;
};

type Staff = {
  id: string;
  full_name: string;
  role: string;
  monthly_salary: number;
  join_date: string | null;
};

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-PK", { month: "long", year: "numeric" });
}

export function SalaryPanel({
  staff,
  payments,
  buildingName,
}: {
  staff: Staff;
  payments: Payment[];
  buildingName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState(monthKey(new Date()));
  const [amount, setAmount] = useState(staff.monthly_salary);
  const [mode, setMode] = useState("cash");
  const [slipNo, setSlipNo] = useState("");
  const [notes, setNotes] = useState("");

  // Build list of last 12 months
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }

  const paidMap = new Map<string, Payment>();
  payments.forEach((p) => paidMap.set(p.pay_month, p));

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        await paySalary({
          staff_id: staff.id,
          pay_month: month,
          amount,
          payment_mode: mode,
          slip_no: slipNo || null,
          notes: notes || null,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const downloadSlip = async (p: Payment) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Salary Slip", 105, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text(buildingName, 105, 28, { align: "center" });
    doc.setLineWidth(0.5);
    doc.line(15, 34, 195, 34);

    let y = 46;
    const row = (k: string, v: string) => {
      doc.setFont("helvetica", "bold");
      doc.text(k, 20, y);
      doc.setFont("helvetica", "normal");
      doc.text(v, 80, y);
      y += 8;
    };

    row("Slip No:", p.slip_no || p.id.slice(0, 8).toUpperCase());
    row("Staff Name:", staff.full_name);
    row("Role:", staff.role);
    row("Pay Month:", monthLabel(p.pay_month));
    row("Payment Date:", p.payment_date ? formatDate(p.payment_date) : "—");
    row("Payment Mode:", p.payment_mode || "cash");
    row("Amount Paid:", formatCurrency(p.amount));
    if (p.notes) row("Notes:", p.notes);

    y += 10;
    doc.line(15, y, 195, y);
    y += 14;
    doc.setFontSize(11);
    doc.text("Received By: ____________________", 20, y);
    doc.text("Paid By: ____________________", 120, y);

    doc.save(`salary-slip-${staff.full_name.replace(/\s+/g, "_")}-${p.pay_month}.pdf`);
  };

  // Counts for the small KPI strip
  const paidCount = months.filter((m) => paidMap.has(m)).length;
  const pendingCount = months.length - paidCount;
  const totalPaid = months
    .map((m) => paidMap.get(m))
    .filter((p): p is Payment => !!p)
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);

  return (
    <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
      {/* Header — compact, with KPIs + smaller CTA */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border-b border-border">
        <div>
          <h3 className="text-xl font-semibold">Salary Disbursement</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {paidCount} paid · {pendingCount} pending · {formatCurrency(totalPaid)} paid in last 12 months
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0 gap-1.5">
          + Pay Salary
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary border-b border-border">
            <tr className="text-left">
              <th className="px-3 py-3 font-semibold">Month</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold text-right">Amount</th>
              <th className="px-3 py-3 font-semibold">Paid on</th>
              <th className="px-3 py-3 font-semibold">Mode</th>
              <th className="px-3 py-3 font-semibold text-right">Slip</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const p = paidMap.get(m);
              const isCurrentMonth = m === monthKey(new Date());
              return (
                <tr key={m} className="border-b border-border last:border-0 hover:bg-secondary/50">
                  <td className="px-3 py-3 font-medium whitespace-nowrap">
                    {monthLabel(m)}
                    {isCurrentMonth && (
                      <span className="ml-2 text-[10px] text-primary font-semibold uppercase tracking-wide">
                        Current
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {p ? (
                      <span className="status-paid inline-flex px-2 py-0.5 rounded-full text-xs">
                        Paid
                      </span>
                    ) : (
                      <span className="status-pending inline-flex px-2 py-0.5 rounded-full text-xs">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                    {p ? (
                      <span className="font-semibold">{formatCurrency(p.amount)}</span>
                    ) : (
                      <span className="text-muted-foreground">{formatCurrency(staff.monthly_salary)}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                    {p?.payment_date ? formatDate(p.payment_date) : "—"}
                  </td>
                  <td className="px-3 py-3 capitalize text-muted-foreground whitespace-nowrap">
                    {p?.payment_mode ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {p ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Download slip"
                        onClick={() => downloadSlip(p)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay Salary — {staff.full_name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Pay month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>
                      {monthLabel(m)}{paidMap.has(m) ? " (already paid)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="amt">Amount (Rs.)</Label>
              <Input
                id="amt"
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Payment mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="slip">Slip number (optional)</Label>
              <Input
                id="slip"
                value={slipNo}
                onChange={(e) => setSlipNo(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || amount <= 0}>
              {pending ? "Saving..." : "Record payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
