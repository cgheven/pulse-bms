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

  return (
    <div className="card-soft">
      <div className="flex items-center justify-between mb-4">
        <h3>Salary disbursement</h3>
        <Button onClick={() => setOpen(true)} className="btn-big">
          Pay Salary
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="text-left text-sm text-muted-foreground border-b">
            <tr>
              <th className="py-2">Month</th>
              <th className="py-2">Status</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Paid on</th>
              <th className="py-2">Mode</th>
              <th className="py-2">Slip</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const p = paidMap.get(m);
              return (
                <tr key={m} className="border-b last:border-0">
                  <td className="py-3 font-medium">{monthLabel(m)}</td>
                  <td className="py-3">
                    {p ? (
                      <span className="status-paid px-2 py-0.5 rounded-full text-xs">
                        Paid
                      </span>
                    ) : (
                      <span className="status-pending px-2 py-0.5 rounded-full text-xs">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="py-3">
                    {p ? formatCurrency(p.amount) : formatCurrency(staff.monthly_salary)}
                  </td>
                  <td className="py-3">{p?.payment_date ? formatDate(p.payment_date) : "—"}</td>
                  <td className="py-3">{p?.payment_mode ?? "—"}</td>
                  <td className="py-3">
                    {p ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadSlip(p)}
                      >
                        <Download className="w-4 h-4 mr-1" /> Slip
                      </Button>
                    ) : (
                      "—"
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
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)} {paidMap.has(m) ? "(already paid)" : ""}
                  </option>
                ))}
              </select>
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
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
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
