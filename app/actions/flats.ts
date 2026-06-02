"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { normalizePhone, syntheticEmailFromPhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";

export type FlatInput = {
  flat_number: string;
  floor?: number | null;
  block?: string | null;
  size_sqft?: number | null;
  monthly_fee?: number | null;
  ownership_type?: "owner" | "tenant" | "vacant";
  notes?: string | null;
};

export async function createFlat(input: FlatInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const payload = {
    building_id: buildingId,
    flat_number: input.flat_number.trim(),
    floor: input.floor ?? null,
    block: input.block?.trim() || null,
    size_sqft: input.size_sqft ?? null,
    monthly_fee: input.monthly_fee ?? null,
    ownership_type: input.ownership_type ?? "owner",
    notes: input.notes?.trim() || null,
  };

  const { data, error } = await supabase
    .from("bms_flats")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "flat.create",
    entity: "flat",
    entity_id: data.id,
    meta: payload,
  });

  revalidatePath("/admin/flats");
  revalidatePath("/admin");
  return data;
}

export async function updateFlat(id: string, input: Partial<FlatInput>) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.flat_number !== undefined) patch.flat_number = input.flat_number.trim();
  if (input.floor !== undefined) patch.floor = input.floor;
  if (input.block !== undefined) patch.block = input.block?.trim() || null;
  if (input.size_sqft !== undefined) patch.size_sqft = input.size_sqft;
  if (input.monthly_fee !== undefined) patch.monthly_fee = input.monthly_fee;
  if (input.ownership_type !== undefined) patch.ownership_type = input.ownership_type;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const { data, error } = await supabase
    .from("bms_flats")
    .update(patch)
    .eq("id", id)
    .eq("building_id", buildingId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "flat.update",
    entity: "flat",
    entity_id: id,
    meta: patch,
  });

  revalidatePath("/admin/flats");
  revalidatePath(`/admin/flats/${id}`);
  revalidatePath("/admin");
  return data;
}

export async function deleteFlat(id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const { error } = await supabase
    .from("bms_flats")
    .delete()
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "flat.delete",
    entity: "flat",
    entity_id: id,
  });

  revalidatePath("/admin/flats");
  revalidatePath("/admin");
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
 * createFlatWithPeople — atomic flat + owner (+ optional tenant) creation.
 *
 * Each person can have either mobile, email, both, or neither. If any contact
 * info is present we auto-provision a Supabase auth user so they get their own
 * resident portal. Same mobile across flats reuses the existing account.
 *
 * Returns generated logins so the UI can copy/share them with each person.
 * ────────────────────────────────────────────────────────────────────────── */

export type FlatPersonInput = {
  full_name?: string | null;
  phone?: string | null; // any human form; normalized server-side
  email?: string | null;
  cnic?: string | null;
};

export type FlatWithPeopleInput = {
  flat: FlatInput;
  owner?: FlatPersonInput | null;
  tenant?: FlatPersonInput | null;
};

export type CreatedLogin = {
  resident_id: string;
  profile_id: string;
  full_name: string;
  relationship: "owner" | "tenant";
  // Username shown to the resident — mobile if available, else real email.
  username: string;
  // Whether `username` is a phone (else email). Drives display + share links.
  username_kind: "phone" | "email";
  // Present only when a brand-new account was provisioned. Null when an
  // existing account (e.g. same owner across two flats) was reused.
  password: string | null;
};

export type CreateFlatWithPeopleResult = {
  flat_id: string;
  logins: CreatedLogin[];
};

function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 10; i++) out += chars[arr[i] % chars.length];
  return out;
}

/**
 * Ensure a profile exists for this person.
 *
 * Lookup order: phone (canonical) → email. If found, we reuse and skip auth
 * user creation (no new password generated — they already have one).
 * Otherwise we provision a Supabase auth user with a random 10-char password
 * and insert a matching bms_profiles row.
 *
 * Returns null when neither phone nor email was supplied — caller should
 * create the resident row without a profile_id (contact-only entry).
 */
async function ensureProfile(
  person: FlatPersonInput,
  buildingId: string,
): Promise<{
  profile_id: string;
  password: string | null;
  username: string;
  username_kind: "phone" | "email";
} | null> {
  const phone = normalizePhone(person.phone);
  const realEmail = person.email?.trim().toLowerCase() || null;

  if (!phone && !realEmail) return null;

  // The auth identifier we hand Supabase. Synthetic when only mobile present.
  const authEmail = realEmail ?? (phone ? syntheticEmailFromPhone(phone) : null);
  if (!authEmail) return null;

  const admin = createAdminClient();

  // Reuse path — same mobile across flats = same human = same account.
  // We always rotate the password so admin walks away from flat creation with
  // a fresh shareable credential. Old session/password is invalidated.
  let reuseId: string | null = null;
  let reuseUsername = "";
  let reuseKind: "phone" | "email" = "phone";
  if (phone) {
    const { data: existingByPhone } = await admin
      .from("bms_profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (existingByPhone) {
      reuseId = existingByPhone.id;
      reuseUsername = phone;
      reuseKind = "phone";
    }
  }
  if (!reuseId && realEmail) {
    const { data: existingByEmail } = await admin
      .from("bms_profiles")
      .select("id")
      .eq("email", realEmail)
      .maybeSingle();
    if (existingByEmail) {
      reuseId = existingByEmail.id;
      reuseUsername = realEmail;
      reuseKind = "email";
    }
  }

  const password = generatePassword();

  if (reuseId) {
    // Rotate password, lift any ban, AND confirm the email. Each of these
    // produces the same "Invalid login credentials" message at sign-in, so
    // clear all three on every reissue (revoke ban, old invite never confirmed,
    // stale password).
    const { error: pwErr } = await admin.auth.admin.updateUserById(reuseId, {
      password,
      ban_duration: "none",
      email_confirm: true,
    });
    if (pwErr) throw new Error(pwErr.message);
    await admin
      .from("bms_profiles")
      .update({ is_active: true })
      .eq("id", reuseId);
    return {
      profile_id: reuseId,
      password,
      username: reuseUsername,
      username_kind: reuseKind,
    };
  }

  // Provision new auth user (email pre-confirmed so they can sign in immediately).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: person.full_name?.trim() || null },
  });
  if (createErr || !created?.user) {
    throw new Error(createErr?.message ?? "Could not create login");
  }

  // Insert the profile row. Phone is stored canonical when present.
  const { error: profileErr } = await admin.from("bms_profiles").upsert(
    {
      id: created.user.id,
      email: authEmail,
      full_name: person.full_name?.trim() || null,
      phone: phone ?? null,
      role: "resident" as const,
      building_id: buildingId,
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (profileErr) throw new Error(profileErr.message);

  return {
    profile_id: created.user.id,
    password,
    username: phone ?? realEmail!,
    username_kind: phone ? "phone" : "email",
  };
}

export async function createFlatWithPeople(
  input: FlatWithPeopleInput,
): Promise<CreateFlatWithPeopleResult> {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();
  const admin = createAdminClient();

  // 1. Create the flat
  const flatPayload = {
    building_id: buildingId,
    flat_number: input.flat.flat_number.trim(),
    floor: input.flat.floor ?? null,
    block: input.flat.block?.trim() || null,
    size_sqft: input.flat.size_sqft ?? null,
    monthly_fee: input.flat.monthly_fee ?? null,
    ownership_type: input.flat.ownership_type ?? "owner",
    notes: input.flat.notes?.trim() || null,
  };
  const { data: flat, error: flatErr } = await supabase
    .from("bms_flats")
    .insert(flatPayload)
    .select()
    .single();
  if (flatErr) throw new Error(flatErr.message);

  const logins: CreatedLogin[] = [];

  // The resident who actually lives in the flat is primary. For owner-occupied
  // that's the owner. For tenant-occupied that's the tenant; owner exists for
  // contact + their own portal view but is not the on-site primary.
  const ownerIsPrimary = flatPayload.ownership_type !== "tenant";

  // 2. Owner — always processed when any owner info supplied.
  if (input.owner && hasAnyValue(input.owner)) {
    const profileResult = await ensureProfile(input.owner, buildingId);
    const { data: residentRow, error: resErr } = await admin
      .from("bms_residents")
      .insert({
        building_id: buildingId,
        flat_id: flat.id,
        profile_id: profileResult?.profile_id ?? null,
        full_name: input.owner.full_name?.trim() || "Owner",
        phone: normalizePhone(input.owner.phone),
        email: input.owner.email?.trim() || null,
        cnic: input.owner.cnic?.trim() || null,
        relationship: "owner" as const,
        is_primary: ownerIsPrimary,
        is_active: true,
      })
      .select("id, full_name")
      .single();
    if (resErr) throw new Error(resErr.message);

    if (profileResult) {
      logins.push({
        resident_id: residentRow.id,
        profile_id: profileResult.profile_id,
        full_name: residentRow.full_name,
        relationship: "owner",
        username: profileResult.username,
        username_kind: profileResult.username_kind,
        password: profileResult.password,
      });
    }
  }

  // 3. Tenant — only for rented flats.
  if (
    flatPayload.ownership_type === "tenant" &&
    input.tenant &&
    hasAnyValue(input.tenant)
  ) {
    const profileResult = await ensureProfile(input.tenant, buildingId);
    const { data: residentRow, error: resErr } = await admin
      .from("bms_residents")
      .insert({
        building_id: buildingId,
        flat_id: flat.id,
        profile_id: profileResult?.profile_id ?? null,
        full_name: input.tenant.full_name?.trim() || "Tenant",
        phone: normalizePhone(input.tenant.phone),
        email: input.tenant.email?.trim() || null,
        cnic: input.tenant.cnic?.trim() || null,
        relationship: "tenant" as const,
        is_primary: true,
        is_active: true,
      })
      .select("id, full_name")
      .single();
    if (resErr) throw new Error(resErr.message);

    if (profileResult) {
      logins.push({
        resident_id: residentRow.id,
        profile_id: profileResult.profile_id,
        full_name: residentRow.full_name,
        relationship: "tenant",
        username: profileResult.username,
        username_kind: profileResult.username_kind,
        password: profileResult.password,
      });
    }
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "flat.create",
    entity: "flat",
    entity_id: flat.id,
    meta: {
      ...flatPayload,
      logins_created: logins.length,
      logins_reused: logins.filter((l) => l.password === null).length,
    },
  });

  revalidatePath("/admin/flats");
  revalidatePath("/admin/residents");
  revalidatePath("/admin");
  return { flat_id: flat.id, logins };
}

function hasAnyValue(p: FlatPersonInput): boolean {
  return Boolean(
    p.full_name?.trim() || p.phone?.trim() || p.email?.trim() || p.cnic?.trim(),
  );
}
