"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
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
  await requireNotDemo();
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
  await requireNotDemo();
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
  await requireNotDemo();
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
  await requireNotDemo();
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
  await requireNotDemo();
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
  await requireNotDemo();
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

/* ────────────────────────────────────────────────────────────── */
/* Hard deletes (Super Admin only)                              */
/* ────────────────────────────────────────────────────────────── */

/**
 * Refuse-if-not-empty building delete.
 *
 * We count every dependent table that's scoped by `building_id`. If any has
 * rows we surface the counts so the Super Admin knows exactly what to clean
 * up first (e.g. "3 flats, 8 invoices, 2 payments"). This is deliberately
 * not a cascade: months of billing history must not be wiped by a single
 * misclick.
 */
export async function deleteBuilding(id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole("super_admin");
  if (!id) throw new Error("Building id required");

  const admin = createAdminClient();

  // Verify the building actually exists before counting — gives a cleaner
  // error than "0 dependents, deleted nothing".
  const { data: building, error: bErr } = await admin
    .from("bms_buildings")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (bErr) throw new Error(bErr.message);
  if (!building) throw new Error("Building not found");

  // Tables whose rows are scoped to this building.
  const tables = [
    "bms_flats",
    "bms_residents",
    "bms_invoices",
    "bms_payments",
    "bms_expenses",
    "bms_staff",
    "bms_salary_payments",
    "bms_complaints",
    "bms_facility_tasks",
    "bms_notices",
    "bms_proposals",
    "bms_meetings",
    "bms_elections",
    "bms_union_members",
    "bms_profiles",
  ] as const;

  const counts: Record<string, number> = {};
  for (const t of tables) {
    const { count } = await admin
      .from(t)
      .select("id", { count: "exact", head: true })
      .eq("building_id", id);
    if (count && count > 0) counts[t] = count;
  }

  if (Object.keys(counts).length > 0) {
    // Friendly summary using the most relevant tables first
    const priority: { key: string; label: (n: number) => string }[] = [
      { key: "bms_flats", label: (n) => `${n} ${n === 1 ? "flat" : "flats"}` },
      { key: "bms_residents", label: (n) => `${n} ${n === 1 ? "resident" : "residents"}` },
      { key: "bms_profiles", label: (n) => `${n} ${n === 1 ? "admin/union member" : "admins/union members"}` },
      { key: "bms_invoices", label: (n) => `${n} ${n === 1 ? "invoice" : "invoices"}` },
      { key: "bms_payments", label: (n) => `${n} ${n === 1 ? "payment" : "payments"}` },
      { key: "bms_expenses", label: (n) => `${n} ${n === 1 ? "expense" : "expenses"}` },
      { key: "bms_staff", label: (n) => `${n} staff` },
      { key: "bms_complaints", label: (n) => `${n} ${n === 1 ? "complaint" : "complaints"}` },
    ];
    const parts: string[] = [];
    for (const p of priority) {
      if (counts[p.key]) parts.push(p.label(counts[p.key]));
    }
    // Catch anything not in the priority list
    for (const [k, v] of Object.entries(counts)) {
      if (!priority.some((p) => p.key === k)) {
        parts.push(`${v} row${v === 1 ? "" : "s"} in ${k}`);
      }
    }
    throw new Error(
      `Building has data: ${parts.join(" · ")}. Remove or reassign these first, or use Deactivate to hide the building instead.`,
    );
  }

  const { error: delErr } = await admin
    .from("bms_buildings")
    .delete()
    .eq("id", id);
  if (delErr) throw new Error(delErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: null,
    action: "building.delete",
    entity: "building",
    entity_id: id,
    meta: { name: building.name },
  });

  revalidatePath("/super-admin/buildings");
  revalidatePath("/super-admin");
}

/**
 * Hard-delete an admin/union profile.
 *
 * Removes the Supabase auth user (which cascades to bms_profiles via the FK
 * on profile.id -> auth.users.id) AND any bms_union_members links. We refuse
 * to delete a Super Admin or the caller themselves to avoid lockouts.
 */
export async function deleteAdmin(profileId: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole("super_admin");
  if (!profileId) throw new Error("Profile id required");
  if (profileId === user.id) {
    throw new Error("You cannot delete your own Super Admin account.");
  }

  const admin = createAdminClient();
  const { data: target, error: tErr } = await admin
    .from("bms_profiles")
    .select("id, email, full_name, role, building_id")
    .eq("id", profileId)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!target) throw new Error("User not found");
  if (target.role === "super_admin") {
    throw new Error("Super Admin accounts cannot be deleted from here.");
  }

  // Best-effort: clear any union-members link so we don't leave orphan FK rows.
  await admin.from("bms_union_members").delete().eq("profile_id", profileId);

  // Detach from residents (keep the resident records, just unlink the auth user)
  await admin
    .from("bms_residents")
    .update({ profile_id: null })
    .eq("profile_id", profileId);

  // Delete the auth user — bms_profiles row cascades on auth.users delete.
  const { error: delErr } = await admin.auth.admin.deleteUser(profileId);
  if (delErr) throw new Error(delErr.message);

  // Defensive: if no cascade exists on the bms_profiles FK, drop the row too.
  await admin.from("bms_profiles").delete().eq("id", profileId);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: target.building_id,
    action: "admin.delete",
    entity: "profile",
    entity_id: profileId,
    meta: {
      email: target.email,
      role: target.role,
      full_name: target.full_name,
    },
  });

  revalidatePath("/super-admin/admins");
  revalidatePath("/super-admin");
}
