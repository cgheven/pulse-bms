"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { revalidatePath } from "next/cache";

/* ────────────────────────────────────────────────────────────── */
/* Bill Accounts                                                 */
/*                                                               */
/* Set-up-once utility / vendor account records (KE Block A,     */
/* SSGC Building, Nayatel, Lift AMC). Monthly expenses link via   */
/* bms_expenses.bill_account_id. Soft-delete via is_active.      */
/* ────────────────────────────────────────────────────────────── */

export type BillAccountInput = {
  /** Provider key from lib/bill-providers (e.g. 'k_electric', 'other'). */
  provider: string;
  /** Required ONLY when provider='other' — admin-typed custom label. */
  provider_label?: string | null;
  /** Friendly name for the row in pickers + reports ("Block A KE"). */
  nickname: string;
  /** Connection / consumer / contract number. */
  account_number: string;
  /** Free-form scope hint: "Block A", "Lift", "Common", "Generator". */
  location?: string | null;
  notes?: string | null;
};

const REVALIDATE_PATHS = [
  "/admin/bill-accounts",
  "/admin/expenses",
];

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
  // Bills report keys off bill_account_id — bust the whole reports tree.
  revalidatePath("/admin/reports", "layout");
}

function validate(input: BillAccountInput): {
  provider: string;
  provider_label: string | null;
  nickname: string;
  account_number: string;
  location: string | null;
  notes: string | null;
} {
  const provider = input.provider?.trim();
  const nickname = input.nickname?.trim();
  const account_number = input.account_number?.trim();
  const provider_label = input.provider_label?.trim() || null;
  const location = input.location?.trim() || null;
  const notes = input.notes?.trim() || null;

  if (!provider) throw new Error("Provider is required");
  if (!nickname) throw new Error("Nickname is required");
  if (!account_number) throw new Error("Account number is required");
  if (provider === "other" && !provider_label) {
    throw new Error("Custom provider label is required when provider is 'Other'");
  }

  return { provider, provider_label, nickname, account_number, location, notes };
}

export async function createBillAccount(input: BillAccountInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const clean = validate(input);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bms_bill_accounts")
    .insert({
      building_id: buildingId,
      provider: clean.provider,
      provider_label: clean.provider_label,
      nickname: clean.nickname,
      account_number: clean.account_number,
      location: clean.location,
      notes: clean.notes,
      is_active: true,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "bill_account.create",
    entity: "bill_account",
    entity_id: data.id,
    meta: {
      provider: data.provider,
      nickname: data.nickname,
      account_number: data.account_number,
      location: data.location,
    },
  });

  revalidateAll();
  return data;
}

export async function updateBillAccount(
  id: string,
  input: Partial<BillAccountInput>,
) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();

  // Cross-tenant guard — RLS already blocks reads, but the update should
  // fail loudly with a useful error instead of silently returning zero
  // rows.
  const { data: existing } = await supabase
    .from("bms_bill_accounts")
    .select(
      "id, provider, provider_label, nickname, account_number, location, notes, is_active",
    )
    .eq("id", id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!existing) throw new Error("Bill account not found");

  // Merge then validate so partial patches still satisfy "provider_label
  // required when provider='other'" etc.
  const merged: BillAccountInput = {
    provider: input.provider ?? existing.provider,
    provider_label: input.provider_label ?? existing.provider_label,
    nickname: input.nickname ?? existing.nickname,
    account_number: input.account_number ?? existing.account_number,
    location: input.location ?? existing.location,
    notes: input.notes ?? existing.notes,
  };
  const clean = validate(merged);

  const { error } = await supabase
    .from("bms_bill_accounts")
    .update({
      provider: clean.provider,
      provider_label: clean.provider_label,
      nickname: clean.nickname,
      account_number: clean.account_number,
      location: clean.location,
      notes: clean.notes,
    })
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "bill_account.update",
    entity: "bill_account",
    entity_id: id,
    meta: {
      before: {
        provider: existing.provider,
        provider_label: existing.provider_label,
        nickname: existing.nickname,
        account_number: existing.account_number,
        location: existing.location,
        notes: existing.notes,
        is_active: existing.is_active,
      },
      after: {
        provider: clean.provider,
        provider_label: clean.provider_label,
        nickname: clean.nickname,
        account_number: clean.account_number,
        location: clean.location,
        notes: clean.notes,
      },
      patch: input as unknown as Record<string, unknown>,
    },
  });

  revalidateAll();
}

/**
 * Soft delete via is_active. We never hard-delete because expenses link
 * to the account row; flipping is_active hides it from the picker but
 * leaves historical bills intact.
 */
export async function setBillAccountActive(id: string, active: boolean) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("bms_bill_accounts")
    .select("id")
    .eq("id", id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!existing) throw new Error("Bill account not found");

  const { error } = await supabase
    .from("bms_bill_accounts")
    .update({ is_active: active })
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: active ? "bill_account.reactivate" : "bill_account.deactivate",
    entity: "bill_account",
    entity_id: id,
    meta: { is_active: active },
  });

  revalidateAll();
}
