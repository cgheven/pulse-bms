"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

/* ────────────────────────────────────────────────────────────── */
/* Buildings                                                    */
/* ────────────────────────────────────────────────────────────── */

// Super Admin only manages the building shell (name, location, planned size).
// Fees, voting rule and utility cutoff are managed by the building's Union via
// updateBuildingSettings — see app/actions/union.ts.
export type BuildingInput = {
  name: string;
  address?: string | null;
  city?: string | null;
  total_flats?: number | null;
};

export async function createBuilding(data: BuildingInput) {
  const { profile, user } = await requireRole("super_admin");

  if (!data.name || !data.name.trim()) {
    throw new Error("Building name is required");
  }

  // Sensible Pakistani-building defaults seeded once; the Union changes these later.
  const payload = {
    name: data.name.trim(),
    address: data.address?.trim() || null,
    city: data.city?.trim() || "Karachi",
    total_flats: data.total_flats ?? 0,
    entry_fee_owner: 10000,
    entry_fee_tenant: 5000,
    monthly_fee_default: 3000,
    voting_rule: "majority" as const,
    utility_cutoff_after_months: 3,
    is_active: true,
  };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("bms_buildings")
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: row.id,
    action: "building.create",
    entity: "building",
    entity_id: row.id,
    meta: payload,
  });

  revalidatePath("/super-admin/buildings");
  revalidatePath("/super-admin");
  return row;
}

export async function updateBuilding(id: string, data: BuildingInput) {
  const { profile, user } = await requireRole("super_admin");

  if (!id) throw new Error("Building id required");
  if (!data.name || !data.name.trim()) {
    throw new Error("Building name is required");
  }

  // Update only Super Admin-owned fields. Union-managed fields are untouched —
  // they live behind updateBuildingSettings in app/actions/union.ts.
  const payload = {
    name: data.name.trim(),
    address: data.address?.trim() || null,
    city: data.city?.trim() || "Karachi",
    total_flats: data.total_flats ?? 0,
  };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("bms_buildings")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: id,
    action: "building.update",
    entity: "building",
    entity_id: id,
    meta: payload,
  });

  revalidatePath("/super-admin/buildings");
  revalidatePath(`/super-admin/buildings/${id}`);
  revalidatePath("/super-admin");
  return row;
}

export async function setBuildingActive(id: string, isActive: boolean) {
  const { profile, user } = await requireRole("super_admin");

  if (!id) throw new Error("Building id required");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_buildings")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: id,
    action: isActive ? "building.activate" : "building.deactivate",
    entity: "building",
    entity_id: id,
    meta: { is_active: isActive },
  });

  revalidatePath("/super-admin/buildings");
  revalidatePath(`/super-admin/buildings/${id}`);
  revalidatePath("/super-admin");
}

/* ────────────────────────────────────────────────────────────── */
/* Admins                                                       */
/* ────────────────────────────────────────────────────────────── */

export async function createAdmin(data: {
  email: string;
  password: string;
  full_name?: string | null;
  phone?: string | null;
  building_id: string;
}) {
  const { profile, user } = await requireRole("super_admin");

  const email = data.email?.trim().toLowerCase();
  const password = data.password?.trim() ?? "";
  if (!email) throw new Error("Email is required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!data.building_id) throw new Error("Building is required");

  const admin = createAdminClient();

  // Look up existing user by email
  const { data: existing, error: lookupErr } = await admin
    .from("bms_profiles")
    .select("id, role, building_id")
    .eq("email", email)
    .maybeSingle();

  if (lookupErr) throw new Error(lookupErr.message);

  let userId: string;
  let createdNew = false;

  if (existing) {
    // User already exists — update their password and reuse the account.
    userId = existing.id;
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
    if (pwErr) throw new Error(pwErr.message);
  } else {
    // Create a brand-new auth user with the chosen password, email pre-confirmed
    // so they can sign in immediately (no verification email).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name?.trim() || null },
    });
    if (createErr || !created?.user) {
      throw new Error(createErr?.message || "Failed to create user");
    }
    userId = created.user.id;
    createdNew = true;
  }

  // Upsert profile with admin role + building
  const profilePayload = {
    id: userId,
    email,
    full_name: data.full_name?.trim() || null,
    phone: data.phone?.trim() || null,
    role: "admin" as const,
    building_id: data.building_id,
    is_active: true,
  };

  const { error: upsertErr } = await admin
    .from("bms_profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (upsertErr) throw new Error(upsertErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: data.building_id,
    action: createdNew ? "admin.create" : "admin.assign",
    entity: "profile",
    entity_id: userId,
    meta: { email, building_id: data.building_id, full_name: data.full_name ?? null },
  });

  revalidatePath("/super-admin/admins");
  revalidatePath("/super-admin");
  return { id: userId, created: createdNew };
}

export async function reassignAdmin(profileId: string, buildingId: string) {
  const { profile, user } = await requireRole("super_admin");

  if (!profileId) throw new Error("Admin id required");
  if (!buildingId) throw new Error("Building required");

  const admin = createAdminClient();
  const { error } = await admin
    .from("bms_profiles")
    .update({ building_id: buildingId, role: "admin", is_active: true })
    .eq("id", profileId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "admin.reassign",
    entity: "profile",
    entity_id: profileId,
    meta: { building_id: buildingId },
  });

  revalidatePath("/super-admin/admins");
}

export async function setAdminActive(profileId: string, isActive: boolean) {
  const { profile, user } = await requireRole("super_admin");

  if (!profileId) throw new Error("Admin id required");

  const admin = createAdminClient();
  const { error } = await admin
    .from("bms_profiles")
    .update({ is_active: isActive })
    .eq("id", profileId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action: isActive ? "admin.activate" : "admin.deactivate",
    entity: "profile",
    entity_id: profileId,
    meta: { is_active: isActive },
  });

  revalidatePath("/super-admin/admins");
}
