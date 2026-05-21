"use client";

import { useEffect, useState, useTransition } from "react";
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
import { friendlyErrorMessage } from "@/lib/toast-error";
import { createClient } from "@/lib/supabase/client";

type BankAccountOption = { id: string; name: string; type: "cash" | "bank" };

// Salaries are NOT here — they live in /admin/staff (bms_salary_payments).
// Keeping them separate avoids double-entry and lets us track per-staff slips.
const CATEGORIES: Record<Exclude<ExpenseCategory, "salaries">, string> = {
  utilities: "Utilities",
  repairs: "Repairs",
  supplies: "Supplies",
  other: "Other",
};

const CUSTOM_SENTINEL = "__custom__";

// Subcategory presets per category. Values are kebab-case slugs (saved to DB);
// labels are shown to user.
const SUBCATS_BY_CATEGORY: Record<ExpenseCategory, { value: string; label: string }[]> = {
  utilities: [
    { value: "corridor_electricity", label: "Corridor Electricity (K-Electric)" },
    { value: "water_motor",          label: "Water Motor" },
    { value: "lift_service",         label: "Lift Service / AMC" },
    { value: "generator_diesel",     label: "Generator Diesel" },
    { value: "generator_oil",        label: "Generator Oil" },
    { value: "internet",             label: "Internet / Wi-Fi" },
    { value: "gas",                  label: "Gas" },
    { value: "water_supply",         label: "Water Supply / Tanker" },
  ],
  repairs: [
    { value: "bulbs",         label: "Bulbs / LEDs" },
    { value: "wiring",        label: "Electrical Wiring" },
    { value: "plumbing",      label: "Plumbing" },
    { value: "led_panels",    label: "LED Panels" },
    { value: "painting",      label: "Painting" },
    { value: "lift_repair",   label: "Lift Repair" },
    { value: "generator",     label: "Generator Service" },
    { value: "pest_control",  label: "Pest Control" },
    { value: "carpentry",     label: "Carpentry / Woodwork" },
    { value: "roof_leak",     label: "Roof / Tank Leak" },
  ],
  salaries: [],  // unused — kept to satisfy type; salaries managed in /admin/staff
  supplies: [
    { value: "cleaning",   label: "Cleaning Supplies" },
    { value: "paint",      label: "Paint Supplies" },
    { value: "stationery", label: "Stationery / Office" },
    { value: "hardware",   label: "Hardware / Tools" },
  ],
  other: [],
};

export function ExpenseForm({
  open,
  onOpenChange,
  expense,
  buildingId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expense?: (ExpenseInput & { id: string }) | null;
  /**
   * Active building scope — used to filter bank account options the admin
   * can pick from. Threaded explicitly so this client component never
   * needs to derive scope from cookies / RLS alone.
   */
  buildingId?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
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
    is_bill: expense?.is_bill ?? false,
    bank_account_id: expense?.bank_account_id ?? null,
  });

  // Load active bank accounts for the current building so the admin can
  // pick which account this expense was paid from. The default Cash row
  // seeded by the migration is auto-selected if nothing has been chosen.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!buildingId) return;
      const supabase = createClient();
      const { data } = await supabase
        .from("bms_bank_accounts")
        .select("id, name, type")
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .order("type", { ascending: false }) // 'cash' first
        .order("name");
      if (cancelled) return;
      const rows = (data ?? []) as BankAccountOption[];
      setBankAccounts(rows);
      // Auto-select the first cash account if nothing is picked yet.
      setForm((f) => {
        if (f.bank_account_id) return f;
        const cash = rows.find((r) => r.type === "cash") ?? rows[0];
        return cash ? { ...f, bank_account_id: cash.id } : f;
      });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [buildingId]);

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
        setError(friendlyErrorMessage(e, "Could not save expense"));
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
              onValueChange={(v) => {
                // Category changed — reset subcategory so user picks fresh
                setForm({ ...form, category: v as ExpenseCategory, subcategory: "" });
              }}
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

          {(() => {
            const presets = SUBCATS_BY_CATEGORY[form.category] ?? [];
            const currentValue = form.subcategory ?? "";
            const isPreset = presets.some((p) => p.value === currentValue);
            const showCustom =
              presets.length === 0 || (currentValue !== "" && !isPreset);
            const selectValue = showCustom ? CUSTOM_SENTINEL : currentValue;

            return (
              <div>
                <Label htmlFor="sub">Subcategory</Label>
                {presets.length > 0 ? (
                  <Select
                    value={selectValue}
                    onValueChange={(v) => {
                      if (v === CUSTOM_SENTINEL) {
                        // switch to custom: clear so the input is empty + focusable
                        setForm({ ...form, subcategory: "" });
                      } else {
                        setForm({ ...form, subcategory: v });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose subcategory" />
                    </SelectTrigger>
                    <SelectContent>
                      {presets.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_SENTINEL}>
                        Other (specify…)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
                {showCustom && (
                  <Input
                    id="sub"
                    className={presets.length > 0 ? "mt-2" : ""}
                    value={currentValue}
                    onChange={(e) =>
                      setForm({ ...form, subcategory: e.target.value })
                    }
                    placeholder="Type custom subcategory"
                    autoFocus={presets.length > 0}
                  />
                )}
              </div>
            );
          })()}

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
            <Label>Paid from</Label>
            <Select
              value={form.bank_account_id ?? ""}
              onValueChange={(v) =>
                setForm({ ...form, bank_account_id: v || null })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick bank or cash" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} {b.type === "cash" ? "(Cash)" : "(Bank)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* is_bill toggle — distinguishes recurring utility BILLS from
              operating EXPENSES. Drives which Reports module page the row
              shows up on (Bills vs Expenses). */}
          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              id="isbill"
              type="checkbox"
              className="h-5 w-5"
              checked={!!form.is_bill}
              onChange={(e) =>
                setForm({ ...form, is_bill: e.target.checked })
              }
            />
            <Label htmlFor="isbill">
              Is this a recurring utility bill? (K-Electric, SSGC, internet,
              lift AMC, security contract, etc.)
            </Label>
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
