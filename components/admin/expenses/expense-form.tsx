"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  expenseCategoryForProvider,
  providerCategoryFor,
  providerLabelFor,
  type ProviderCategory,
} from "@/lib/bill-providers";

type BankAccountOption = { id: string; name: string; type: "cash" | "bank" };

// Light-weight subset of bms_bill_accounts the picker needs. Loaded
// client-side when the dialog opens (only when is_bill is on).
type BillAccountOption = {
  id: string;
  provider: string;
  provider_label: string | null;
  nickname: string;
  account_number: string;
  location: string | null;
};

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
  prefill,
  forcedMode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expense?: (ExpenseInput & { id: string }) | null;
  buildingId?: string | null;
  prefill?: Partial<ExpenseInput> | null;
  /** When set, locks the form to bill or expense mode and hides the switch link. */
  forcedMode?: "bill" | "expense";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [billAccounts, setBillAccounts] = useState<BillAccountOption[]>([]);
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
    is_bill: expense?.is_bill ?? (forcedMode != null ? forcedMode === "bill" : (prefill?.is_bill ?? false)),
    bank_account_id: expense?.bank_account_id ?? null,
    bill_account_id:
      expense?.bill_account_id ?? prefill?.bill_account_id ?? null,
    units_consumed: expense?.units_consumed ?? null,
    due_date: expense?.due_date ?? null,
  });

  // Separate string states so the user can briefly hold an empty or
  // partial value mid-keystroke without us coercing to 0 and locking
  // the Save button. Both are coerced to their target types on submit.
  const [amountInput, setAmountInput] = useState<string>(
    expense?.amount != null && Number(expense.amount) > 0
      ? String(expense.amount)
      : "",
  );
  const [unitsInput, setUnitsInput] = useState<string>(
    expense?.units_consumed != null ? String(expense.units_consumed) : "",
  );

  // Reset transient string inputs when the create dialog closes so stale
  // values don't bleed into the next open. Edit mode is skipped — the
  // form unmounts between edit sessions via conditional rendering in
  // ExpenseRowActions, so its state never persists across edits.
  useEffect(() => {
    if (!open && !expense) {
      setAmountInput("");
      setUnitsInput("");
    }
  }, [open, expense]);

  // When the dialog re-opens for a create with a fresh prefill (deep-link
  // from Bill Accounts "Add Bill"), apply the prefill on top of current
  // form state. Edit mode is unaffected — `expense` always wins.
  useEffect(() => {
    if (!open || expense || !prefill) return;
    setForm((f) => ({
      ...f,
      // forcedMode always wins; only fall back to prefill when mode is unconstrained
      is_bill: forcedMode != null ? forcedMode === "bill" : (prefill.is_bill ?? f.is_bill),
      bill_account_id: prefill.bill_account_id ?? f.bill_account_id,
    }));
  }, [open, expense, prefill, forcedMode]);

  // When the prefill carries a bill_account_id and bill accounts have
  // finished loading, auto-fill category + subcategory + vendor +
  // description from the matched account. Mirrors what the picker does
  // when the user changes account manually, so deep-link arrivals get
  // the same clean state.
  useEffect(() => {
    if (!open || expense || !prefill?.bill_account_id) return;
    if (billAccounts.length === 0) return;
    const picked = billAccounts.find((b) => b.id === prefill.bill_account_id);
    if (!picked) return;
    const { category, subcategory } = expenseCategoryForProvider(picked.provider);
    const providerLbl = providerLabelFor(picked.provider, picked.provider_label);
    setForm((f) => ({
      ...f,
      category: f.category === "utilities" ? category : f.category,
      subcategory: f.subcategory ? f.subcategory : subcategory,
      vendor:
        f.vendor && f.vendor.trim() ? f.vendor : `${providerLbl} – ${picked.nickname}`,
      description:
        f.description && f.description.trim()
          ? f.description
          : `Account #${picked.account_number}`,
    }));
  }, [open, expense, prefill, billAccounts]);

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

  // Load active bill accounts the first time the user flips on is_bill.
  // Lazy load so the form is snappy when the user isn't recording a bill.
  useEffect(() => {
    let cancelled = false;
    if (!buildingId || !form.is_bill) return;
    if (billAccounts.length > 0) return;
    async function loadBills() {
      const supabase = createClient();
      const { data } = await supabase
        .from("bms_bill_accounts")
        .select("id, provider, provider_label, nickname, account_number, location")
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .order("nickname");
      if (cancelled) return;
      setBillAccounts((data ?? []) as BillAccountOption[]);
    }
    loadBills();
    return () => {
      cancelled = true;
    };
  }, [buildingId, form.is_bill, billAccounts.length]);

  // Bill accounts grouped by provider category for the dropdown.
  const billAccountsByCat = useMemo(() => {
    const map = new Map<ProviderCategory, BillAccountOption[]>();
    for (const b of billAccounts) {
      const cat = providerCategoryFor(b.provider);
      const list = map.get(cat) ?? [];
      list.push(b);
      map.set(cat, list);
    }
    return map;
  }, [billAccounts]);

  // Units field is shown whenever this expense is flagged as a bill.
  // Optional — admin leaves blank for flat-fee bills (internet, AMC).
  const showUnitsField = !!form.is_bill;

  const submit = () => {
    setError(null);
    // Coerce the units input string to number | null. Empty / hidden
    // field → null. If the field is currently hidden (is_bill off, no
    // bill account, or category doesn't support units) we also clear
    // the value so toggling is_bill back off doesn't ship a stale
    // reading on save.
    let unitsValue: number | null = null;
    if (showUnitsField) {
      const trimmed = unitsInput.trim();
      if (trimmed !== "") {
        const n = Number(trimmed);
        if (Number.isNaN(n) || n < 0) {
          setError("Units consumed must be 0 or more");
          return;
        }
        unitsValue = n;
      }
    }
    const payload: ExpenseInput = { ...form, units_consumed: unitsValue };
    start(async () => {
      try {
        if (expense?.id) {
          await updateExpense(expense.id, payload);
        } else {
          await createExpense(payload);
        }
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        setError(friendlyErrorMessage(e, "Could not save expense"));
      }
    });
  };

  const billMode = !!form.is_bill;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {expense ? "Edit" : "Add"} {billMode ? "bill" : "expense"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Category + Subcategory only shown in EXPENSE mode. Bill mode
              derives both from the picked bill account's provider — no
              point asking admin to pick "Utilities → Corridor Electricity"
              when they already told us this is a K-Electric bill. */}
          {!billMode && (
            <>
              <div>
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => {
                    setForm({
                      ...form,
                      category: v as ExpenseCategory,
                      subcategory: "",
                    });
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
            </>
          )}

          <div className="sm:col-span-2">
            <Label htmlFor="desc">Description</Label>
            <Input
              id="desc"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder={
                billMode ? "Auto-filled from bill account" : "What was this expense for?"
              }
            />
          </div>

          <div>
            <Label htmlFor="amt">Amount (Rs.)</Label>
            <Input
              id="amt"
              type="number"
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                const n = parseFloat(e.target.value);
                setForm({ ...form, amount: isNaN(n) ? 0 : n });
              }}
            />
          </div>

          <div>
            <Label htmlFor="date">{billMode ? "Date paid" : "Date"}</Label>
            <Input
              id="date"
              type="date"
              value={form.expense_date}
              onChange={(e) =>
                setForm({ ...form, expense_date: e.target.value })
              }
            />
          </div>

          {/* Due date — only meaningful for bills. Compared against the
              paid date in reports to flag late payments. */}
          {billMode && (
            <div>
              <Label htmlFor="due">Due date</Label>
              <Input
                id="due"
                type="date"
                value={form.due_date ?? ""}
                onChange={(e) =>
                  setForm({ ...form, due_date: e.target.value || null })
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                As printed on the challan. Used to flag late payments.
              </p>
            </div>
          )}

          {form.is_bill && (
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Bill account</Label>
                <Link
                  href="/admin/bill-accounts"
                  className="text-xs text-primary hover:underline"
                  target="_blank"
                  rel="noopener"
                >
                  Manage Bill Accounts &rarr;
                </Link>
              </div>
              <Select
                value={form.bill_account_id ?? ""}
                onValueChange={(v) => {
                  const picked = billAccounts.find((b) => b.id === v);
                  if (!picked) {
                    setForm({ ...form, bill_account_id: v || null });
                    return;
                  }
                  // Auto-fill everything we can derive from the bill
                  // account: vendor (provider + nickname), description
                  // (account #), expense category + subcategory (from
                  // provider category). Admin can override any of these
                  // after picking.
                  const providerLbl = providerLabelFor(
                    picked.provider,
                    picked.provider_label,
                  );
                  const { category, subcategory } = expenseCategoryForProvider(
                    picked.provider,
                  );
                  setForm({
                    ...form,
                    bill_account_id: picked.id,
                    category,
                    subcategory,
                    vendor:
                      form.vendor && form.vendor.trim()
                        ? form.vendor
                        : `${providerLbl} – ${picked.nickname}`,
                    description:
                      form.description && form.description.trim()
                        ? form.description
                        : `Account #${picked.account_number}`,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a bill account" />
                </SelectTrigger>
                <SelectContent>
                  {billAccounts.length === 0 && (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      No active bill accounts yet.{" "}
                      <Link
                        href="/admin/bill-accounts"
                        className="text-primary hover:underline"
                      >
                        Add one
                      </Link>
                      .
                    </div>
                  )}
                  {CATEGORY_ORDER.filter((c) => billAccountsByCat.has(c)).map(
                    (cat) => (
                      <SelectGroup key={cat}>
                        <SelectLabel>{CATEGORY_LABEL[cat]}</SelectLabel>
                        {(billAccountsByCat.get(cat) ?? []).map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.nickname} ({b.account_number})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Units consumed — single optional field. Shown for any bill
              regardless of category. Admin leaves it blank for flat-fee
              bills (internet, AMC). Matches how PK challans actually
              print "units" — no kWh/HM³/m³ distinction. */}
          {showUnitsField && (
            <div>
              <Label htmlFor="units">Units consumed (optional)</Label>
              <Input
                id="units"
                type="number"
                inputMode="numeric"
                min={0}
                step="1"
                value={unitsInput}
                onChange={(e) => setUnitsInput(e.target.value)}
                placeholder="e.g. 300"
              />
              <p className="text-xs text-muted-foreground mt-1">
                As printed on the bill. Lets the committee spot usage
                spikes month-over-month.
              </p>
            </div>
          )}

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

          {/* Mode switch — hidden when editing an existing row or when
              the caller has locked the mode via forcedMode. */}
          {!expense && !forcedMode && (
            <div className="sm:col-span-2 text-xs text-muted-foreground">
              {billMode ? (
                <>
                  Not a utility bill?{" "}
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        is_bill: false,
                        bill_account_id: null,
                      })
                    }
                    className="text-primary hover:underline"
                  >
                    Switch to general expense
                  </button>
                </>
              ) : (
                <>
                  Recording a utility bill?{" "}
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        is_bill: true,
                        category: "utilities",
                      })
                    }
                    className="text-primary hover:underline"
                  >
                    Switch to bill mode
                  </button>
                </>
              )}
            </div>
          )}

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
              pending ||
              !form.description.trim() ||
              form.amount <= 0 ||
              !amountInput.trim()
            }
          >
            {pending
              ? "Saving..."
              : expense
                ? "Save"
                : billMode
                  ? "Record bill"
                  : "Add expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
