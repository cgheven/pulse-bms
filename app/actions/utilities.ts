"use server";

import { requireRole, requireSession, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { revalidatePath } from "next/cache";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`Invalid ${label}: expected a UUID`);
  }
}

// ─── Exported Types ───────────────────────────────────────────────────────────

export type UtilityType = {
  id: string;
  name: string;
  code: string | null;
  is_system: boolean;
  sort_order: number;
  building_id: string | null;
};

export type UtilityAccountRow = {
  id: string;
  building_id: string;
  flat_id: string;
  flat_number: string;
  floor: number | null;
  utility_type_id: string;
  utility_name: string;
  utility_code: string | null;
  account_number: string;
  account_holder_name: string | null;
  notes: string | null;
  submitted_by_resident: boolean;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  payment_status: "paid" | "unpaid" | "unknown";
};

// ─── 1. getUtilityTypes ───────────────────────────────────────────────────────

/**
 * Returns all active utility types visible to the current building.
 * Includes system-wide types (building_id IS NULL) plus any custom types
 * belonging to the given buildingId.
 * Requires an authenticated session; callers must be signed in.
 */
export async function getUtilityTypes(
  buildingId?: string | null,
): Promise<UtilityType[]> {
  // Enforce authentication — this is a "use server" RPC endpoint
  await requireSession();

  if (buildingId) {
    assertUuid(buildingId, "buildingId");
  }

  const supabase = await createClient();

  let query = supabase
    .from("bms_utility_types")
    .select("id, name, code, is_system, sort_order, building_id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (buildingId) {
    // Return system-wide types AND types belonging to this building
    query = query.or(`building_id.is.null,building_id.eq.${buildingId}`);
  } else {
    // No building context — only return system-wide types
    query = query.is("building_id", null);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as UtilityType[];
}

// ─── 2. getUtilityAccounts ────────────────────────────────────────────────────

/**
 * Returns all active utility accounts for a building with flat and type info
 * joined in. Restricted to admin and super_admin roles.
 */
export async function getUtilityAccounts(
  buildingId: string,
  filters?: { utility_type_id?: string },
): Promise<UtilityAccountRow[]> {
  await requireRole(["admin", "super_admin"]);
  assertUuid(buildingId, "buildingId");
  const supabase = await createClient();

  let query = supabase
    .from("bms_utility_accounts")
    .select(
      `
      id,
      building_id,
      flat_id,
      utility_type_id,
      account_number,
      account_holder_name,
      notes,
      submitted_by_resident,
      is_verified,
      is_active,
      created_at,
      payment_status,
      bms_flats!inner ( flat_number, floor ),
      bms_utility_types!inner ( name, code )
      `,
    )
    .eq("building_id", buildingId)
    .eq("is_active", true)
    .order("bms_flats(flat_number)", { ascending: true });

  if (filters?.utility_type_id) {
    assertUuid(filters.utility_type_id, "utility_type_id filter");
    query = query.eq("utility_type_id", filters.utility_type_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const flat = (Array.isArray(row.bms_flats) ? row.bms_flats[0] : row.bms_flats) as { flat_number: string; floor: number | null };
    const utype = (Array.isArray(row.bms_utility_types) ? row.bms_utility_types[0] : row.bms_utility_types) as { name: string; code: string | null };
    return {
      id: row.id as string,
      building_id: row.building_id as string,
      flat_id: row.flat_id as string,
      flat_number: flat.flat_number,
      floor: flat.floor,
      utility_type_id: row.utility_type_id as string,
      utility_name: utype.name,
      utility_code: utype.code,
      account_number: row.account_number as string,
      account_holder_name: row.account_holder_name as string | null,
      notes: row.notes as string | null,
      submitted_by_resident: row.submitted_by_resident as boolean,
      is_verified: row.is_verified as boolean,
      is_active: row.is_active as boolean,
      created_at: row.created_at as string,
      payment_status: (row.payment_status ?? "unknown") as "paid" | "unpaid" | "unknown",
    };
  });
}

// ─── 3. upsertUtilityAccount (admin) ─────────────────────────────────────────

/**
 * Admin creates or updates a utility account for any flat in their building.
 * Upserts on conflict (flat_id, utility_type_id), marking the entry as
 * admin-verified and clearing the submitted_by_resident flag.
 */
export async function upsertUtilityAccount(data: {
  flat_id: string;
  utility_type_id: string;
  account_number: string;
  account_holder_name?: string | null;
  notes?: string | null;
}): Promise<void> {
  const { profile, user } = await requireRole(["admin"]);
  await requireNotDemo();
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  assertUuid(data.flat_id, "flat_id");
  assertUuid(data.utility_type_id, "utility_type_id");

  if (!data.account_number || data.account_number.trim().length === 0) {
    throw new Error("Account number is required.");
  }
  if (data.account_number.trim().length > 100) {
    throw new Error("Account number too long.");
  }
  if (data.account_holder_name && data.account_holder_name.trim().length > 100) {
    throw new Error("Account holder name too long.");
  }
  if (data.notes && data.notes.trim().length > 500) {
    throw new Error("Notes too long.");
  }

  const supabase = await createClient();

  // Cross-tenant guard: flat must belong to this building
  const { data: flatCheck } = await supabase
    .from("bms_flats")
    .select("id")
    .eq("id", data.flat_id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!flatCheck) throw new Error("Flat not found in your building.");

  // Cross-tenant guard: utility type must be a system type or belong to this building
  const { data: typeCheck } = await supabase
    .from("bms_utility_types")
    .select("id")
    .eq("id", data.utility_type_id)
    .eq("is_active", true)
    .or(`building_id.is.null,building_id.eq.${buildingId}`)
    .maybeSingle();
  if (!typeCheck) throw new Error("Utility type not found for your building.");

  const { data: upserted, error } = await supabase
    .from("bms_utility_accounts")
    .upsert(
      {
        building_id: buildingId,
        flat_id: data.flat_id,
        utility_type_id: data.utility_type_id,
        account_number: data.account_number.trim(),
        account_holder_name: data.account_holder_name ?? null,
        notes: data.notes ?? null,
        is_verified: true,
        submitted_by_resident: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "flat_id,utility_type_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error("An unexpected error occurred. Please try again.");

  const trimmedAccNum = data.account_number.trim();
  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "utility_account.upsert",
    entity: "utility_account",
    entity_id: upserted.id as string,
    meta: {
      flat_id: data.flat_id,
      utility_type_id: data.utility_type_id,
      account_number_last4: trimmedAccNum.slice(-4).padStart(trimmedAccNum.length, "*"),
    },
  });

  revalidatePath("/admin/utilities");
}

// ─── 4. residentUpsertUtilityAccount ─────────────────────────────────────────

/**
 * Resident submits or updates a utility account for their own flat.
 * Entry is always marked submitted_by_resident=true, is_verified=false
 * until an admin reviews it.
 */
export async function residentUpsertUtilityAccount(data: {
  utility_type_id: string;
  account_number: string;
  account_holder_name?: string | null;
  notes?: string | null;
}): Promise<void> {
  const { profile, user } = await requireRole("resident");
  await requireNotDemo();

  assertUuid(data.utility_type_id, "utility_type_id");

  if (!data.account_number || data.account_number.trim().length === 0) {
    throw new Error("Account number is required.");
  }
  if (data.account_number.trim().length > 100) {
    throw new Error("Account number too long.");
  }
  if (data.account_holder_name && data.account_holder_name.trim().length > 100) {
    throw new Error("Account holder name too long.");
  }
  if (data.notes && data.notes.trim().length > 500) {
    throw new Error("Notes too long.");
  }

  const supabase = await createClient();

  // Resolve the resident's flat and building
  const { data: residentRow } = await supabase
    .from("bms_residents")
    .select("flat_id, building_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!residentRow) {
    throw new Error("No active flat found for your account.");
  }

  // Validate that the utility_type_id belongs to the resident's building (or is a system type)
  const { data: typeCheck } = await supabase
    .from("bms_utility_types")
    .select("id")
    .eq("id", data.utility_type_id)
    .eq("is_active", true)
    .or(`building_id.is.null,building_id.eq.${residentRow.building_id as string}`)
    .maybeSingle();
  if (!typeCheck) throw new Error("Invalid utility type.");

  const { data: upserted, error } = await supabase
    .from("bms_utility_accounts")
    .upsert(
      {
        building_id: residentRow.building_id as string,
        flat_id: residentRow.flat_id as string,
        utility_type_id: data.utility_type_id,
        account_number: data.account_number.trim(),
        account_holder_name: data.account_holder_name ?? null,
        notes: data.notes ?? null,
        submitted_by_resident: true,
        is_verified: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "flat_id,utility_type_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error("An unexpected error occurred. Please try again.");

  const trimmedResidentAccNum = data.account_number.trim();
  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: residentRow.building_id as string,
    action: "utility_account.resident_upsert",
    entity: "utility_account",
    entity_id: upserted.id as string,
    meta: {
      flat_id: residentRow.flat_id,
      utility_type_id: data.utility_type_id,
      account_number_last4: trimmedResidentAccNum.slice(-4).padStart(trimmedResidentAccNum.length, "*"),
    },
  });

  revalidatePath("/resident/bill-numbers");
}

// ─── 5. deleteUtilityAccount ──────────────────────────────────────────────────

/**
 * Soft-deletes a utility account (is_active = false).
 * Admin only; verifies building ownership before update.
 */
export async function deleteUtilityAccount(id: string): Promise<void> {
  assertUuid(id, "id");
  const { profile, user } = await requireRole(["admin"]);
  await requireNotDemo();
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();

  // Verify the row belongs to this building
  const { data: existing } = await supabase
    .from("bms_utility_accounts")
    .select("id")
    .eq("id", id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!existing) throw new Error("Utility account not found.");

  const { error } = await supabase
    .from("bms_utility_accounts")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error("An unexpected error occurred. Please try again.");

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "utility_account.delete",
    entity: "utility_account",
    entity_id: id,
  });

  revalidatePath("/admin/utilities");
}

// ─── 6. verifyUtilityAccount ──────────────────────────────────────────────────

/**
 * Admin marks a utility account as verified (or un-verified).
 * Used to approve resident-submitted account numbers.
 */
export async function verifyUtilityAccount(
  id: string,
  verified: boolean,
): Promise<void> {
  assertUuid(id, "id");
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  await requireNotDemo();
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();

  // Verify the row belongs to this building
  const { data: existing } = await supabase
    .from("bms_utility_accounts")
    .select("id")
    .eq("id", id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!existing) throw new Error("Utility account not found.");

  const { error } = await supabase
    .from("bms_utility_accounts")
    .update({ is_verified: verified, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error("An unexpected error occurred. Please try again.");

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: verified
      ? "utility_account.verified"
      : "utility_account.unverified",
    entity: "utility_account",
    entity_id: id,
    meta: { is_verified: verified },
  });

  revalidatePath("/admin/utilities");
}

// ─── 7. updatePaymentStatus ───────────────────────────────────────────────────

/**
 * Admin updates the payment_status of a utility account (paid / unpaid / unknown).
 * Validates the status against a server-side whitelist before writing to the DB.
 */
export async function updatePaymentStatus(
  id: string,
  status: "paid" | "unpaid" | "unknown",
): Promise<void> {
  assertUuid(id, "id");
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  await requireNotDemo();
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  // Server-side whitelist — do NOT trust the client value directly
  const VALID = ["paid", "unpaid", "unknown"] as const;
  if (!VALID.includes(status)) throw new Error("Invalid payment status.");

  const supabase = await createClient();

  // Verify the row belongs to this building before updating
  const { data: existing } = await supabase
    .from("bms_utility_accounts")
    .select("id")
    .eq("id", id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!existing) throw new Error("Utility account not found.");

  const { error } = await supabase
    .from("bms_utility_accounts")
    .update({ payment_status: status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error("An unexpected error occurred. Please try again.");

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "utility_account.payment_status_update",
    entity: "utility_account",
    entity_id: id,
    meta: { status },
  });

  revalidatePath("/admin/utilities");
}
