"use server";

import { requireRole } from "@/lib/auth";
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
};

export async function createExpense(input: ExpenseInput) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

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
  return data;
}

export async function updateExpense(id: string, input: Partial<ExpenseInput>) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

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
  return data;
}

export async function deleteExpense(id: string) {
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
}
