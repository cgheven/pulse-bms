"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath, revalidateTag } from "next/cache";

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
  opening_balance_amount?: number | null;
  opening_balance_date?: string | null;
  // Optional: assign an existing admin account to this building on creation.
  admin_id?: string | null;
};

function isValidIsoDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Provisions ONE building with the canonical default setup: Pakistani-building
 * fee defaults + a zero-balance Cash account (so payment/expense forms always
 * have an account to post against). This is the single source of truth shared
 * by `createBuilding` (single, from the Buildings page) and
 * `createAdminWithBuildings` (bulk, from the Create Admin form) so a building
 * is identical no matter where it was created.
 *
 * Throws on any failure (building insert OR cash-account insert) so callers can
 * react — no silent half-created buildings.
 */
async function provisionBuilding(
  db: Awaited<ReturnType<typeof createClient>>,
  input: {
    name: string;
    total_flats?: number | null;
    city?: string | null;
    address?: string | null;
    opening_balance_amount?: number;
    opening_balance_date?: string;
  },
): Promise<{ id: string; payload: Record<string, unknown> }> {
  const today = new Date().toISOString().slice(0, 10);
  const openingAmount = Number(input.opening_balance_amount ?? 0);
  const openingDate = input.opening_balance_date?.trim() || today;

  const payload = {
    name: input.name.trim(),
    address: input.address?.trim() || null,
    city: input.city?.trim() || "Karachi",
    total_flats: Math.max(0, Number(input.total_flats) || 0),
    entry_fee_owner: 10000,
    entry_fee_tenant: 5000,
    monthly_fee_default: 3000,
    voting_rule: "majority" as const,
    utility_cutoff_after_months: 3,
    is_active: true,
    opening_balance_amount: openingAmount,
    opening_balance_date: openingDate,
    // Mirror legacy fund_balance so admin/super-admin hero views match from row 0.
    fund_balance: openingAmount,
  };

  const { data: row, error } = await db
    .from("bms_buildings")
    .insert(payload)
    .select("id")
    .single();
  if (error || !row) {
    throw new Error(
      `Could not create building "${input.name}": ${error?.message ?? "unknown error"}`,
    );
  }

  // Default Cash drawer — error-checked (no silent failure).
  const { error: baErr } = await db.from("bms_bank_accounts").insert({
    building_id: row.id,
    name: "Cash",
    type: "cash",
    opening_balance: 0,
    opening_balance_date: today,
    is_active: true,
  });
  if (baErr) {
    // Compensating cleanup: drop the orphan building (cascade removes nothing
    // else yet) so we never leave a building without its mandatory account.
    await db.from("bms_buildings").delete().eq("id", row.id);
    throw new Error(
      `Could not seed Cash account for "${input.name}": ${baErr.message}`,
    );
  }

  return { id: row.id, payload };
}

export async function createBuilding(data: BuildingInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole("super_admin");

  if (!data.name || !data.name.trim()) {
    throw new Error("Building name is required");
  }

  // Opening balance is optional at creation — Super Admin can leave it
  // at zero and let the building's own admin set it later from
  // /admin/settings/opening-balance.
  const today = new Date().toISOString().slice(0, 10);
  const openingAmount = Number(data.opening_balance_amount ?? 0);
  if (!Number.isFinite(openingAmount) || openingAmount < 0) {
    throw new Error("Opening balance must be zero or a positive number.");
  }
  const openingDate = data.opening_balance_date?.trim() || today;
  if (!isValidIsoDateStr(openingDate)) {
    throw new Error("Pick a valid opening balance date.");
  }
  if (openingDate > today) {
    throw new Error("Opening balance date cannot be in the future.");
  }
  if (data.admin_id && !UUID_RE.test(data.admin_id)) {
    throw new Error("Invalid admin id.");
  }

  const supabase = await createClient();

  // Single source of truth for building setup (building row + Cash account),
  // shared with createAdminWithBuildings so both paths are identical.
  const { id: buildingId, payload } = await provisionBuilding(supabase, {
    name: data.name,
    address: data.address,
    city: data.city,
    total_flats: data.total_flats,
    opening_balance_amount: openingAmount,
    opening_balance_date: openingDate,
  });
  const row = { id: buildingId };

  // If an admin was selected, assign them to this building immediately.
  if (data.admin_id) {
    const adminClient = createAdminClient();
    // Add to junction table (is_primary = true if they have no other buildings)
    const { count } = await adminClient
      .from("bms_admin_buildings")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", data.admin_id);
    const isPrimary = (count ?? 0) === 0;
    await adminClient.from("bms_admin_buildings").upsert(
      { profile_id: data.admin_id, building_id: row.id, is_primary: isPrimary },
      { onConflict: "profile_id,building_id" }
    );
    // If this is their first building, also set profile.building_id
    if (isPrimary) {
      await adminClient
        .from("bms_profiles")
        .update({ building_id: row.id, role: "admin", is_active: true })
        .eq("id", data.admin_id);
      revalidateTag(`bms-profile-${data.admin_id}`);
    }
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: row.id,
    action: "building.create",
    entity: "building",
    entity_id: row.id,
    meta: { ...payload, admin_id: data.admin_id ?? null },
  });

  revalidatePath("/super-admin/buildings");
  revalidatePath("/super-admin/admins");
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

/**
 * One-shot onboarding: create (or reuse) an admin account AND create all their
 * buildings in one call. Ordering is deliberate for partial-failure safety:
 *
 *   1. validate inputs        (cheap, fail fast)
 *   2. resolve/create the auth user   (the fragile external call — do it FIRST)
 *   3. provision buildings    (with compensating delete if a later step fails)
 *   4. profile + junction
 *
 * If step 3 or 4 fails, every building created in this call is deleted (their
 * Cash accounts + junction rows cascade), so we never leave orphan buildings.
 * Reusing an already-existing auth user is harmless and idempotent on retry.
 */
export async function createAdminWithBuildings(data: {
  email: string;
  password: string;
  full_name?: string | null;
  phone?: string | null;
  building_names: { name: string; total_flats: number }[];   // new buildings to create
  existing_building_ids?: string[]; // already-created buildings to also assign
}) {
  await requireNotDemo();
  const { profile, user } = await requireRole("super_admin");

  // ── 1. Validate (fail fast, before touching anything) ──────────────────────
  const email = data.email?.trim().toLowerCase();
  const password = data.password?.trim() ?? "";
  const buildings = data.building_names
    .filter((b) => b.name.trim())
    .map((b) => ({ name: b.name.trim(), total_flats: Math.max(0, Number(b.total_flats) || 0) }));
  const existingIds = data.existing_building_ids ?? [];

  if (!email) throw new Error("Email is required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  if (buildings.length === 0 && existingIds.length === 0)
    throw new Error("Add at least one building");
  for (const id of existingIds) {
    if (!UUID_RE.test(id)) throw new Error("Invalid building id.");
  }

  const adminDb = createAdminClient();
  const supabase = await createClient();

  // ── 2. Resolve/create the auth user FIRST (the fragile external call) ───────
  // Doing this before any building insert means a bad email / weak password /
  // auth outage fails with ZERO buildings created.
  const { data: existing, error: lookupErr } = await adminDb
    .from("bms_profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (lookupErr) throw new Error(lookupErr.message);

  let userId: string;
  let createdNew = false;

  if (existing) {
    userId = existing.id;
    const { error: pwErr } = await adminDb.auth.admin.updateUserById(userId, { password });
    if (pwErr) throw new Error(pwErr.message);
  } else {
    const { data: created, error: createErr } = await adminDb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name?.trim() || null },
    });
    if (createErr || !created?.user) throw new Error(createErr?.message || "Failed to create user");
    userId = created.user.id;
    createdNew = true;
  }

  // ── 3. Provision buildings, with compensating cleanup on any later failure ──
  const createdBuildingIds: string[] = [];
  try {
    for (const b of buildings) {
      const { id } = await provisionBuilding(supabase, {
        name: b.name,
        total_flats: b.total_flats,
      });
      createdBuildingIds.push(id);
    }

    const allBuildingIds = [...createdBuildingIds, ...existingIds];
    const primaryBuildingId = allBuildingIds[0];

    // ── 4. Profile (phone-conflict safe) ─────────────────────────────────────
    const phone = data.phone?.trim() || null;
    let safePhone = phone;
    if (phone) {
      const { data: phoneOwner } = await adminDb
        .from("bms_profiles")
        .select("id")
        .eq("phone", phone)
        .neq("id", userId)
        .maybeSingle();
      if (phoneOwner) safePhone = null; // taken by someone else — skip it
    }

    const { error: upsertErr } = await adminDb
      .from("bms_profiles")
      .upsert({
        id: userId,
        email,
        full_name: data.full_name?.trim() || null,
        phone: safePhone,
        role: "admin" as const,
        building_id: primaryBuildingId,
        is_active: true,
      }, { onConflict: "id" });
    if (upsertErr) throw new Error(upsertErr.message);

    // Junction: assign every building (error-checked).
    const { error: junctionErr } = await adminDb
      .from("bms_admin_buildings")
      .upsert(
        allBuildingIds.map((bid, i) => ({
          profile_id: userId,
          building_id: bid,
          is_primary: i === 0,
        })),
        { onConflict: "profile_id,building_id" },
      );
    if (junctionErr) throw new Error(junctionErr.message);

    await writeAuditLog({
      actor_id: user.id,
      actor_email: user.email,
      actor_role: profile.role,
      building_id: primaryBuildingId,
      action: "admin.create_with_buildings",
      entity: "profile",
      entity_id: userId,
      meta: {
        email,
        building_names: buildings,
        all_building_ids: allBuildingIds,
        created_new_admin: createdNew,
      },
    });

    revalidateTag(`bms-profile-${userId}`);
    revalidatePath("/super-admin/admins");
    revalidatePath("/super-admin/buildings");
    revalidatePath("/super-admin");
    return { adminId: userId, createdNew, buildingIds: allBuildingIds };
  } catch (err) {
    // Roll back any buildings created in THIS call (cash accounts + junction
    // rows cascade). Existing buildings the admin already had are untouched.
    if (createdBuildingIds.length > 0) {
      await supabase.from("bms_buildings").delete().in("id", createdBuildingIds);
    }
    throw err;
  }
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

  // Sync junction table: demote all existing primary flags, then upsert new primary
  await admin
    .from("bms_admin_buildings")
    .update({ is_primary: false })
    .eq("profile_id", profileId);

  await admin
    .from("bms_admin_buildings")
    .upsert(
      { profile_id: profileId, building_id: buildingId, is_primary: true },
      { onConflict: "profile_id,building_id" }
    );

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

export async function addAdminToBuilding(profileId: string, buildingId: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole("super_admin");

  if (!profileId) throw new Error("Profile id required");
  if (!buildingId) throw new Error("Building id required");

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(profileId)) throw new Error("Invalid profile ID.");
  if (!UUID_RE.test(buildingId)) throw new Error("Invalid building ID.");

  const admin = createAdminClient();

  // Verify target is an admin profile
  const { data: target } = await admin
    .from("bms_profiles")
    .select("id, email, role")
    .eq("id", profileId)
    .maybeSingle();
  if (!target) throw new Error("User not found");
  if (target.role !== "admin") throw new Error("Only admin profiles can be assigned to buildings");

  const { error } = await admin
    .from("bms_admin_buildings")
    .insert({ profile_id: profileId, building_id: buildingId, is_primary: false })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("Admin is already assigned to this building");
    throw new Error(error.message);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "admin.building.add",
    entity: "bms_admin_buildings",
    entity_id: profileId,
    meta: { profile_id: profileId, building_id: buildingId },
  });

  revalidatePath("/super-admin/admins");
}

export async function removeAdminFromBuilding(profileId: string, buildingId: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole("super_admin");

  if (!profileId) throw new Error("Profile id required");
  if (!buildingId) throw new Error("Building id required");

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(profileId)) throw new Error("Invalid profile ID.");
  if (!UUID_RE.test(buildingId)) throw new Error("Invalid building ID.");

  const admin = createAdminClient();

  // Prevent removing the only remaining building
  const { count } = await admin
    .from("bms_admin_buildings")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);

  if ((count ?? 0) <= 1) {
    throw new Error("Cannot remove the admin's only building. Reassign or deactivate the admin instead.");
  }

  const { error } = await admin
    .from("bms_admin_buildings")
    .delete()
    .eq("profile_id", profileId)
    .eq("building_id", buildingId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "admin.building.remove",
    entity: "bms_admin_buildings",
    entity_id: profileId,
    meta: { profile_id: profileId, building_id: buildingId },
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

  // Invalidate the profile cache so getSession() picks up the new is_active
  // value immediately — inactive users will be treated as unauthenticated on
  // their very next request.
  revalidateTag(`bms-profile-${profileId}`);

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
