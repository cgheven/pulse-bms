"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export type ExpenseCategory = "utilities" | "repairs" | "salaries" | "supplies" | "other";
export type ExpenseRecurrence = "monthly" | "quarterly" | "yearly" | null;

export type ExpenseInput = {
  category: ExpenseCategory;
  subcategory?: string | null;
  description: string;
  amount: number;
  expense_date: string;
  is_recurring?: boolean;
  recurrence?: ExpenseRecurrence;
  vendor?: string | null;
  receipt_url?: string | null;
  /**
   * Marks the row as a recurring utility BILL (K-Electric, SSGC, internet,
   * lift AMC, security contract, etc.). The Reports module uses this flag
   * to split the Bills report from the Expenses report — bills are
   * scheduled and predictable, expenses are operating spend.
   */
  is_bill?: boolean;
  /**
   * Which bank account / cash drawer the money came out of. Nullable;
   * defaults to the per-building "Cash" seed account at the form layer.
   */
  bank_account_id?: string | null;
  /**
   * Optional link to a persistent bms_bill_accounts row (KE Block A,
   * SSGC Generator, Nayatel, etc). Set when is_bill=true and admin
   * picked an account in the form; reports filter by this column.
   */
  bill_account_id?: string | null;
  /**
   * Units consumed on the monthly challan (kWh for electricity, HM³
   * for gas, m³ for water). Nullable; only set when is_bill=true AND
   * the provider category supports units. Admin can also enter for
   * provider='other' (label defaults to "units"). Validated >= 0.
   */
  units_consumed?: number | null;
  /**
   * Bill due date as printed on the challan (YYYY-MM-DD). Nullable;
   * only set when is_bill=true. Compared against expense_date to flag
   * late payments in reports.
   */
  due_date?: string | null;
};

export async function createExpense(input: ExpenseInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  // Defensive coercion — a malformed client could submit an empty string
  // for these uuid fields. Postgres rejects "" for uuid columns, so
  // normalise to null before the guards / insert run.
  if (input.bill_account_id === "" || input.bill_account_id === undefined) {
    input.bill_account_id = null;
  }
  if (input.bank_account_id === "" || input.bank_account_id === undefined) {
    input.bank_account_id = null;
  }

  // Coerce blank / undefined units_consumed → null. Validate non-negative
  // and finite if a number was supplied. Mirrors the CHECK constraint at
  // the DB layer so callers get a friendly error before the round-trip.
  // Using Number.isFinite (not just isNaN) also rejects ±Infinity, which
  // a crafted client could otherwise smuggle past the validator.
  if (
    input.units_consumed === undefined ||
    (input.units_consumed as unknown as string) === ""
  ) {
    input.units_consumed = null;
  } else if (
    input.units_consumed !== null &&
    (!Number.isFinite(input.units_consumed) || input.units_consumed < 0)
  ) {
    throw new Error("Units consumed must be 0 or more");
  }

  // Cross-tenant guard: bank_account_id must belong to caller's building.
  // FK constraint allows ANY uuid on INSERT — RLS only filters reads.
  if (input.bank_account_id) {
    const { data: bankCheck } = await supabase
      .from("bms_bank_accounts")
      .select("id")
      .eq("id", input.bank_account_id)
      .eq("building_id", profile.building_id)
      .maybeSingle();
    if (!bankCheck) throw new Error("Invalid bank account");
  }

  // Cross-tenant guard: bill_account_id must belong to caller's building
  // AND be active. Same shape as the bank_account guard — RLS blocks
  // reads but the foreign key would happily accept any uuid. The
  // is_active check stops a crafted client from linking a new expense to
  // a deactivated account (form UI already hides them).
  if (input.bill_account_id) {
    const { data: billCheck } = await supabase
      .from("bms_bill_accounts")
      .select("id")
      .eq("id", input.bill_account_id)
      .eq("building_id", profile.building_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!billCheck) throw new Error("Invalid bill account");
  }

  const { data, error } = await supabase
    .from("bms_expenses")
    .insert({
      building_id: profile.building_id,
      category: input.category,
      subcategory: input.subcategory ?? null,
      description: input.description,
      amount: input.amount,
      expense_date: input.expense_date,
      is_recurring: input.is_recurring ?? false,
      recurrence: input.recurrence ?? null,
      vendor: input.vendor ?? null,
      receipt_url: input.receipt_url ?? null,
      is_bill: input.is_bill ?? false,
      bank_account_id: input.bank_account_id ?? null,
      bill_account_id: input.bill_account_id ?? null,
      units_consumed: input.units_consumed ?? null,
      due_date: input.due_date ? input.due_date : null,
      recorded_by: user.id,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "expense.create",
    entity: "expense",
    entity_id: data.id,
    meta: input as unknown as Record<string, unknown>,
  });

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports", "layout");
  return data;
}

export async function updateExpense(id: string, input: Partial<ExpenseInput>) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  // Defensive coercion — empty strings from a malformed client would
  // otherwise spread into the UPDATE patch and Postgres would reject ""
  // for uuid columns. Treat "" the same as "unset".
  if (input.bill_account_id === "") {
    input.bill_account_id = null;
  }
  if (input.bank_account_id === "") {
    input.bank_account_id = null;
  }

  // Same units_consumed coercion + validation as createExpense. The
  // patch path also accepts an explicit null to clear a previously-set
  // reading (e.g. admin re-classified an internet bill). Number.isFinite
  // rejects ±Infinity in addition to NaN.
  if ((input.units_consumed as unknown as string) === "") {
    input.units_consumed = null;
  } else if (
    input.units_consumed !== null &&
    input.units_consumed !== undefined &&
    (!Number.isFinite(input.units_consumed) || input.units_consumed < 0)
  ) {
    throw new Error("Units consumed must be 0 or more");
  }

  // due_date coercion — accept "" as "clear it" so toggling is_bill off
  // from the form doesn't ship a stale ISO date.
  if (input.due_date === "") input.due_date = null;

  // Cross-tenant guard: if the patch reassigns bank_account_id, verify it
  // belongs to the caller's building before applying the update.
  if (input.bank_account_id) {
    const { data: bankCheck } = await supabase
      .from("bms_bank_accounts")
      .select("id")
      .eq("id", input.bank_account_id)
      .eq("building_id", profile.building_id)
      .maybeSingle();
    if (!bankCheck) throw new Error("Invalid bank account");
  }

  // Same guard for bill_account_id — patches must not point cross-tenant
  // and must target an active account. Prevents re-linking expenses to
  // soft-deleted accounts via a crafted request.
  if (input.bill_account_id) {
    const { data: billCheck } = await supabase
      .from("bms_bill_accounts")
      .select("id")
      .eq("id", input.bill_account_id)
      .eq("building_id", profile.building_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!billCheck) throw new Error("Invalid bill account");
  }

  // Pre-fetch the existing row (building-scoped) so the audit log can
  // capture { before, after } shape — mirrors updateBillAccount in
  // app/actions/bill-accounts.ts. RLS already blocks cross-tenant reads,
  // but the explicit building_id filter makes the cross-tenant guard
  // unambiguous and gives a clean "not found" error rather than a silent
  // zero-row update downstream.
  const { data: existing } = await supabase
    .from("bms_expenses")
    .select(
      "id, category, subcategory, description, amount, expense_date, is_recurring, recurrence, vendor, receipt_url, is_bill, bank_account_id, bill_account_id, units_consumed, due_date",
    )
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .maybeSingle();
  if (!existing) throw new Error("Expense not found");

  const { data, error } = await supabase
    .from("bms_expenses")
    .update(input)
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "expense.update",
    entity: "expense",
    entity_id: id,
    meta: {
      before: {
        category: existing.category,
        subcategory: existing.subcategory,
        description: existing.description,
        amount: existing.amount,
        expense_date: existing.expense_date,
        is_recurring: existing.is_recurring,
        recurrence: existing.recurrence,
        vendor: existing.vendor,
        receipt_url: existing.receipt_url,
        is_bill: existing.is_bill,
        bank_account_id: existing.bank_account_id,
        bill_account_id: existing.bill_account_id,
        units_consumed: existing.units_consumed,
        due_date: existing.due_date,
      },
      after: {
        category: data.category,
        subcategory: data.subcategory,
        description: data.description,
        amount: data.amount,
        expense_date: data.expense_date,
        is_recurring: data.is_recurring,
        recurrence: data.recurrence,
        vendor: data.vendor,
        receipt_url: data.receipt_url,
        is_bill: data.is_bill,
        bank_account_id: data.bank_account_id,
        bill_account_id: data.bill_account_id,
        units_consumed: data.units_consumed,
        due_date: data.due_date,
      },
      patch: input as Record<string, unknown>,
    },
  });

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports", "layout");
  return data;
}

export async function deleteExpense(id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { error } = await supabase
    .from("bms_expenses")
    .delete()
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "expense.delete",
    entity: "expense",
    entity_id: id,
  });

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports", "layout");
}
