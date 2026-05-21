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
};

export async function createExpense(input: ExpenseInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

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
    meta: input as Record<string, unknown>,
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
