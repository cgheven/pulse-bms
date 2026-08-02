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
import { STAFF_ROLE_LABELS, type StaffRole } from "@/types";
import { paySalary } from "@/app/actions/staff";
import { friendlyErrorMessage } from "@/lib/toast-error";

export type SalaryStaffRow = {
  id: string;
  full_name: string;
  role: string;
  monthly_salary: number;
};

export type SalaryPaymentRow = {
  id: string;
  staff_id: string;
  pay_month: string;
  amount: number;
  payment_date: string | null;
  payment_mode: string | null;
  slip_no: string | null;
  notes: string | null;
};

function monthLabel(iso: string) {
  return new Date(iso).toLocaleString("en-PK", { month: "long", year: "numeric" });
}

export function StaffSalarySection({
  staff,
  payments,
  currentMonth,
  months,
  isCurrentMonth,
}: {
  staff: SalaryStaffRow[];
  payments: SalaryPaymentRow[];
  /** The month being viewed and paid — not necessarily the calendar month. */
  currentMonth: string;
  /** Selectable pay months, YYYY-MM-01, newest first. */
  months: string[];
  isCurrentMonth: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<SalaryStaffRow | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState("cash");
  const [slipNo, setSlipNo] = useState("");
  const [notes, setNotes] = useState("");

  const paidMap = new Map(payments.map((p) => [p.staff_id, p]));

  const paidCount = staff.filter((s) => paidMap.has(s.id)).length;
  const pendingTotal = staff
    .filter((s) => !paidMap.has(s.id))
    .reduce((sum, s) => sum + Number(s.monthly_salary), 0);

  function openDialog(s: SalaryStaffRow) {
    setSelected(s);
    setAmount(s.monthly_salary);
    setMode("cash");
    setSlipNo("");
    setNotes("");
    setError(null);
  }

  function closeDialog() {
    setSelected(null);
  }

  function submit() {
    if (!selected) return;
    setError(null);
    start(async () => {
      try {
        await paySalary({
          staff_id: selected.id,
          pay_month: currentMonth,
          amount,
          payment_mode: mode,
          slip_no: slipNo || null,
          notes: notes || null,
        });
        closeDialog();
        router.refresh();
      } catch (e) {
        setError(friendlyErrorMessage(e, "Could not record salary"));
      }
    });
  }

  if (staff.length === 0) return null;

  return (
    <>
      <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">
              Salary Disbursement — {monthLabel(currentMonth)}
              {!isCurrentMonth && (
                <span className="ml-2 text-[10px] text-primary font-semibold uppercase tracking-wide align-middle">
                  Back-dated
                </span>
              )}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {paidCount} of {staff.length} paid
              {pendingTotal > 0 && (
                <> · <span className="text-destructive font-medium">{formatCurrency(pendingTotal)} still pending</span></>
              )}
            </p>
          </div>
          <Select
            value={currentMonth.slice(0, 7)}
            onValueChange={(ym) =>
              router.push(
                ym === months[0].slice(0, 7)
                  ? "/admin/staff"
                  : `/admin/staff?salaryMonth=${ym}`,
              )
            }
          >
            <SelectTrigger className="h-9 w-full sm:w-52 shrink-0">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m.slice(0, 7)}>
                  {monthLabel(m)}
                  {m === months[0] ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b border-border">
              <tr className="text-left">
                <th className="px-3 py-3 font-semibold">Staff</th>
                <th className="px-3 py-3 font-semibold">Role</th>
                <th className="px-3 py-3 font-semibold text-right">Salary</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Paid on</th>
                <th className="px-3 py-3 font-semibold">Mode</th>
                <th className="px-3 py-3 font-semibold">Notes</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const p = paidMap.get(s.id);
                return (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                    <td className="px-3 py-3 font-semibold whitespace-nowrap">{s.full_name}</td>
                    <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                      {STAFF_ROLE_LABELS[s.role as StaffRole] ?? s.role}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold whitespace-nowrap">
                      {formatCurrency(p ? p.amount : s.monthly_salary)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {p ? (
                        <span className="status-paid inline-flex px-2 py-0.5 rounded-full text-xs">Paid</span>
                      ) : (
                        <span className="status-pending inline-flex px-2 py-0.5 rounded-full text-xs">Pending</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                      {p?.payment_date ? formatDate(p.payment_date) : "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground capitalize whitespace-nowrap">
                      {p?.payment_mode ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground text-xs max-w-[160px] truncate">
                      {p?.notes ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {!p && (
                        <Button size="sm" variant="outline" onClick={() => openDialog(s)}>
                          Pay Salary
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(b) => !b && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Pay Salary — {selected?.full_name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            {monthLabel(currentMonth)} · {STAFF_ROLE_LABELS[selected?.role as StaffRole] ?? selected?.role}
          </p>
          <div className="grid gap-4">
            <div>
              <Label htmlFor="sal-amount">Amount (Rs.)</Label>
              <Input
                id="sal-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="h-11 text-base"
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
              <Label htmlFor="sal-slip">Slip number (optional)</Label>
              <Input
                id="sal-slip"
                value={slipNo}
                onChange={(e) => setSlipNo(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="sal-notes">Notes</Label>
              <Textarea
                id="sal-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || amount <= 0} className="btn-big">
              {pending ? "Saving..." : "Record payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
