"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export type BankAccountInput = {
  name: string;
  type: "cash" | "bank";
  account_number_masked?: string | null;
  opening_balance: number;
  opening_balance_date: string;
  is_active?: boolean;
};

export async function createBankAccount(input: BankAccountInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  // Per-bank opening_balance is locked to 0 — society-wide opening is
  // managed once via Settings → Opening Balance. Forcing 0 here prevents
  // an API bypass from creating a double-count in the "All combined"
  // reports view, where the building opening is already added.
  const { data, error } = await supabase
    .from("bms_bank_accounts")
    .insert({
      building_id: profile.building_id,
      name: input.name.trim(),
      type: input.type,
      account_number_masked: input.account_number_masked?.trim() || null,
      opening_balance: 0,
      opening_balance_date: input.opening_balance_date,
      is_active: input.is_active ?? true,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "bank_account.create",
    entity: "bank_account",
    entity_id: data.id,
    meta: { ...input, opening_balance: 0 } as unknown as Record<string, unknown>,
  });

  revalidatePath("/admin/settings/bank-accounts");
  revalidatePath("/admin/reports", "layout");
  return data;
}

export async function updateBankAccount(
  id: string,
  input: Partial<BankAccountInput>,
) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  // Per-bank opening_balance is locked to 0 — society-wide opening is
  // managed via Settings → Opening Balance. Strip any caller-supplied
  // value (or coerce to 0 if explicitly present) before the update so an
  // API bypass cannot reintroduce double-counting in reports.
  const sanitized: Partial<BankAccountInput> = { ...input };
  if ("opening_balance" in sanitized) {
    sanitized.opening_balance = 0;
  }

  const { data, error } = await supabase
    .from("bms_bank_accounts")
    .update(sanitized)
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
    action: "bank_account.update",
    entity: "bank_account",
    entity_id: id,
    meta: sanitized as Record<string, unknown>,
  });

  revalidatePath("/admin/settings/bank-accounts");
  revalidatePath("/admin/reports", "layout");
  return data;
}

export async function deactivateBankAccount(id: string) {
  // Soft-delete via is_active=false so historical payments / expenses
  // still resolve their FK and reports stay accurate. We never hard-delete
  // a bank account that has movement history attached.
  return updateBankAccount(id, { is_active: false });
}
