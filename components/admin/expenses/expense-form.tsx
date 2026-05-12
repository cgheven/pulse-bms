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
import {
  createExpense,
  updateExpense,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseRecurrence,
} from "@/app/actions/expenses";

const CATEGORIES: Record<ExpenseCategory, string> = {
  utilities: "Utilities",
  repairs: "Repairs",
  salaries: "Salaries",
  supplies: "Supplies",
  other: "Other",
};

const SUBCATEGORY_PRESETS = [
  "electricity_corridor",
  "water_motor",
  "lift_service",
  "generator_diesel",
  "generator_oil",
  "bulbs",
  "wiring",
  "plumbing",
];

export function ExpenseForm({
  open,
  onOpenChange,
  expense,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expense?: (ExpenseInput & { id: string }) | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ExpenseInput>({
    category: (expense?.category as ExpenseCategory) ?? "utilities",
    subcategory: expense?.subcategory ?? "",
    description: expense?.description ?? "",
    amount: expense?.amount ?? 0,
    expense_date:
      expense?.expense_date ?? new Date().toISOString().split("T")[0],
    is_recurring: expense?.is_recurring ?? false,
    recurrence: (expense?.recurrence as ExpenseRecurrence) ?? null,
    vendor: expense?.vendor ?? "",
    receipt_url: expense?.receipt_url ?? "",
  });

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        if (expense?.id) {
          await updateExpense(expense.id, form);
        } else {
          await createExpense(form);
        }
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Add expense"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) =>
                setForm({ ...form, category: v as ExpenseCategory })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="sub">Subcategory</Label>
            <Input
              id="sub"
              list="subcat-presets"
              value={form.subcategory ?? ""}
              onChange={(e) =>
                setForm({ ...form, subcategory: e.target.value })
              }
              placeholder="e.g. electricity_corridor"
            />
            <datalist id="subcat-presets">
              {SUBCATEGORY_PRESETS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="desc">Description</Label>
            <Input
              id="desc"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="What was this expense for?"
            />
          </div>

          <div>
            <Label htmlFor="amt">Amount (Rs.)</Label>
            <Input
              id="amt"
              type="number"
              value={form.amount}
              onChange={(e) =>
                setForm({ ...form, amount: Number(e.target.value) })
              }
            />
          </div>

          <div>
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={form.expense_date}
              onChange={(e) =>
                setForm({ ...form, expense_date: e.target.value })
              }
            />
          </div>

          <div>
            <Label htmlFor="vendor">Vendor (optional)</Label>
            <Input
              id="vendor"
              value={form.vendor ?? ""}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="receipt">Receipt URL (optional)</Label>
            <Input
              id="receipt"
              value={form.receipt_url ?? ""}
              onChange={(e) =>
                setForm({ ...form, receipt_url: e.target.value })
              }
              placeholder="https://..."
            />
          </div>

          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              id="rec"
              type="checkbox"
              className="h-5 w-5"
              checked={!!form.is_recurring}
              onChange={(e) =>
                setForm({
                  ...form,
                  is_recurring: e.target.checked,
                  recurrence: e.target.checked
                    ? form.recurrence ?? "monthly"
                    : null,
                })
              }
            />
            <Label htmlFor="rec">Recurring expense</Label>
          </div>

          {form.is_recurring && (
            <div>
              <Label>Recurrence</Label>
              <Select
                value={form.recurrence ?? "monthly"}
                onValueChange={(v) =>
                  setForm({ ...form, recurrence: v as ExpenseRecurrence })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="sm:col-span-2">
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              pending || !form.description.trim() || form.amount <= 0
            }
          >
            {pending ? "Saving..." : expense ? "Save" : "Add expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
