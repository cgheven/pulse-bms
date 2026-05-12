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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/types";
import { createStaff, updateStaff, type StaffInput } from "@/app/actions/staff";

type StaffRow = {
  id: string;
  full_name: string;
  role: StaffRole;
  phone: string | null;
  cnic: string | null;
  monthly_salary: number;
  join_date: string | null;
  exit_date: string | null;
  is_active: boolean | null;
  notes: string | null;
};

export function StaffForm({
  open,
  onOpenChange,
  staff,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  staff?: StaffRow | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<StaffInput>({
    full_name: staff?.full_name ?? "",
    role: (staff?.role as StaffRole) ?? "chowkidar",
    phone: staff?.phone ?? "",
    cnic: staff?.cnic ?? "",
    monthly_salary: staff?.monthly_salary ?? 0,
    join_date: staff?.join_date ?? new Date().toISOString().split("T")[0],
    exit_date: staff?.exit_date ?? null,
    is_active: staff?.is_active ?? true,
    notes: staff?.notes ?? "",
  });

  const onSubmit = () => {
    setError(null);
    start(async () => {
      try {
        if (staff?.id) {
          await updateStaff(staff.id, form);
        } else {
          await createStaff(form);
        }
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{staff ? "Edit staff" : "Add staff"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="e.g. Muhammad Ali"
            />
          </div>

          <div>
            <Label>Role</Label>
            <Select
              value={form.role}
              onValueChange={(v) => setForm({ ...form, role: v as StaffRole })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STAFF_ROLE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="03xx-xxxxxxx"
            />
          </div>

          <div>
            <Label htmlFor="cnic">CNIC</Label>
            <Input
              id="cnic"
              value={form.cnic ?? ""}
              onChange={(e) => setForm({ ...form, cnic: e.target.value })}
              placeholder="xxxxx-xxxxxxx-x"
            />
          </div>

          <div>
            <Label htmlFor="salary">Monthly salary (Rs.)</Label>
            <Input
              id="salary"
              type="number"
              value={form.monthly_salary}
              onChange={(e) =>
                setForm({ ...form, monthly_salary: Number(e.target.value) })
              }
            />
          </div>

          <div>
            <Label htmlFor="join_date">Join date</Label>
            <Input
              id="join_date"
              type="date"
              value={form.join_date ?? ""}
              onChange={(e) => setForm({ ...form, join_date: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="exit_date">Exit date (if any)</Label>
            <Input
              id="exit_date"
              type="date"
              value={form.exit_date ?? ""}
              onChange={(e) =>
                setForm({ ...form, exit_date: e.target.value || null })
              }
            />
          </div>

          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              id="is_active"
              type="checkbox"
              className="h-5 w-5"
              checked={!!form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <Label htmlFor="is_active">Active</Label>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        {error && (
          <p className="text-destructive text-sm">{error}</p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending || !form.full_name.trim()}>
            {pending ? "Saving..." : staff ? "Save changes" : "Add staff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
