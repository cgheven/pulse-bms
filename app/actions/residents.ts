"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { normalizePhone, syntheticEmailFromPhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";

export type ResidentInput = {
  flat_id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  cnic?: string | null;
  relationship?: "owner" | "tenant" | "family";
  is_primary?: boolean;
  move_in_date?: string | null;
  move_out_date?: string | null;
  entry_fee_paid?: number;
  is_active?: boolean;
  invite?: boolean;
};

export async function createResident(input: ResidentInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  // If this resident is primary, demote other primaries on same flat.
  // building_id scope prevents the update from crossing tenant boundaries.
  if (input.is_primary) {
    await supabase
      .from("bms_residents")
      .update({ is_primary: false })
      .eq("flat_id", input.flat_id)
      .eq("building_id", buildingId);
  }

  let profile_id: string | null = null;

  // Optionally invite via email
  if (input.invite && input.email) {
    try {
      const admin = createAdminClient();
      const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(
        input.email,
        {
          data: {
            full_name: input.full_name,
            building_id: buildingId,
            role: "resident",
          },
        },
      );
      if (!invErr && inv?.user?.id) {
        profile_id = inv.user.id;
        // Ensure profile row exists
        await admin.from("bms_profiles").upsert({
          id: inv.user.id,
          email: input.email,
          full_name: input.full_name,
          phone: input.phone ?? null,
          role: "resident",
          building_id: buildingId,
          is_active: true,
        });
      }
    } catch {
      // ignore invite errors — resident is still created
    }
  }

  const payload = {
    building_id: buildingId,
    flat_id: input.flat_id,
    profile_id,
    full_name: input.full_name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    cnic: input.cnic?.trim() || null,
    relationship: input.relationship ?? "owner",
    is_primary: input.is_primary ?? false,
    move_in_date: input.move_in_date || null,
    move_out_date: input.move_out_date || null,
    entry_fee_paid: input.entry_fee_paid ?? 0,
    is_active: input.is_active ?? true,
  };

  const { data, error } = await supabase
    .from("bms_residents")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);

  // If owner/tenant changes flat status
  if (payload.relationship === "owner" || payload.relationship === "tenant") {
    await supabase
      .from("bms_flats")
      .update({ ownership_type: payload.relationship })
      .eq("id", input.flat_id)
      .eq("building_id", buildingId);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "resident.create",
    entity: "resident",
    entity_id: data.id,
    meta: payload,
  });

  revalidatePath("/admin/residents");
  revalidatePath(`/admin/flats/${input.flat_id}`);
  revalidatePath("/admin");
  return data;
}

export async function updateResident(id: string, input: Partial<ResidentInput>) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  // load existing resident to know flat_id
  const { data: existing } = await supabase
    .from("bms_residents")
    .select("flat_id")
    .eq("id", id)
    .eq("building_id", buildingId)
    .single();

  if (input.is_primary && existing?.flat_id) {
    await supabase
      .from("bms_residents")
      .update({ is_primary: false })
      .eq("flat_id", existing.flat_id)
      .neq("id", id);
  }

  const patch: Record<string, unknown> = {};
  if (input.full_name !== undefined) patch.full_name = input.full_name.trim();
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.email !== undefined) patch.email = input.email?.trim() || null;
  if (input.cnic !== undefined) patch.cnic = input.cnic?.trim() || null;
  if (input.relationship !== undefined) patch.relationship = input.relationship;
  if (input.is_primary !== undefined) patch.is_primary = input.is_primary;
  if (input.move_in_date !== undefined) patch.move_in_date = input.move_in_date || null;
  if (input.move_out_date !== undefined) patch.move_out_date = input.move_out_date || null;
  if (input.entry_fee_paid !== undefined) patch.entry_fee_paid = input.entry_fee_paid;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data, error } = await supabase
    .from("bms_residents")
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
    action: "resident.update",
    entity: "resident",
    entity_id: id,
    meta: patch,
  });

  revalidatePath("/admin/residents");
  revalidatePath(`/admin/residents/${id}`);
  if (existing?.flat_id) revalidatePath(`/admin/flats/${existing.flat_id}`);
  return data;
}

export async function deleteResident(id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const { error } = await supabase
    .from("bms_residents")
    .delete()
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "resident.delete",
    entity: "resident",
    entity_id: id,
  });

  revalidatePath("/admin/residents");
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Per-resident login management — mirrors the GMS trainer/staff pattern.
 *
 *   createResidentLogin: provision a fresh auth user (or reuse by phone)
 *                        and link it to the resident row.
 *   resetResidentPassword: rotate the password on an existing auth user.
 *   revokeResidentLogin:  disable the auth user + unlink from the resident.
 *
 * All three return the rendered credentials so the UI can show a Step-2
 * success card with WhatsApp share. Passwords are never persisted plaintext.
 * ────────────────────────────────────────────────────────────────────────── */

export type LoginResult = {
  username: string;
  username_kind: "phone" | "email";
  password: string;
};

function generatePassword(): string {
  // Skip confusables (0/O, I/l/1) so the credentials are easy to dictate / type.
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[arr[i] % chars.length];
  return out;
}

/**
 * Create a portal login for an existing resident.
 *
 * Resolution order for the auth identifier:
 *   1. If phone provided → canonical normalize, store on profile.phone.
 *      Auth email = synthetic <digits>@bms.local (Supabase needs an email).
 *   2. Else if real email present on resident → use that.
 *   3. Else throw — caller must supply at least one.
 *
 * If a profile with the same phone already exists (admin re-creating a login,
 * or one human across multiple flats) we reuse that profile and rotate the
 * password so the resident gets fresh credentials to share.
 */
export async function createResidentLogin(
  residentId: string,
  input: { phone?: string | null; email?: string | null },
): Promise<LoginResult> {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const admin = createAdminClient();

  // 1. Load the resident — building scoped so admins can't touch other buildings
  const { data: resident, error: rErr } = await admin
    .from("bms_residents")
    .select("id, building_id, full_name, phone, email, profile_id")
    .eq("id", residentId)
    .eq("building_id", buildingId)
    .single();
  if (rErr || !resident) throw new Error("Resident not found");

  if (resident.profile_id) {
    throw new Error(
      "Resident already has a login. Use Reset password to rotate credentials.",
    );
  }

  // 2. Decide identifier — prefer mobile, fall back to real email
  const phone = normalizePhone(input.phone ?? resident.phone);
  const realEmail =
    input.email?.trim().toLowerCase() ||
    resident.email?.trim().toLowerCase() ||
    null;
  if (!phone && !realEmail) {
    throw new Error("Mobile number or email is required to create a login.");
  }
  const authEmail = realEmail ?? (phone ? syntheticEmailFromPhone(phone) : null);
  if (!authEmail) throw new Error("Could not derive login identifier");

  const password = generatePassword();

  // 3. Reuse existing account when the same mobile is already in the system.
  // Scope to buildingId so a cross-building phone match can't hijack accounts
  // belonging to residents in other tenants (SEC-001).
  let profile_id: string | null = null;
  if (phone) {
    const { data: existingByPhone } = await admin
      .from("bms_profiles")
      .select("id")
      .eq("phone", phone)
      .eq("building_id", buildingId)
      .maybeSingle();
    if (existingByPhone) profile_id = existingByPhone.id;
  }
  if (!profile_id && realEmail) {
    const { data: existingByEmail } = await admin
      .from("bms_profiles")
      .select("id")
      .eq("email", realEmail)
      .eq("building_id", buildingId)
      .maybeSingle();
    if (existingByEmail) profile_id = existingByEmail.id;
  }

  if (profile_id) {
    // Existing account — rotate password, lift any ban, AND confirm the email.
    // We've now hit two failure modes that all look identical to the user
    // ("Invalid login credentials"): banned_until in the future from a prior
    // revoke, and email_confirmed_at = NULL from an old invite that never
    // completed. Clear both proactively on every reissue.
    const { error: pwErr } = await admin.auth.admin.updateUserById(profile_id, {
      password,
      ban_duration: "none",
      email_confirm: true,
    });
    if (pwErr) throw new Error(pwErr.message);
    // Re-activate the profile too — revoke set is_active=false.
    await admin
      .from("bms_profiles")
      .update({ is_active: true })
      .eq("id", profile_id);
  } else {
    // Fresh account
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: resident.full_name },
    });
    if (createErr || !created?.user) {
      throw new Error(createErr?.message ?? "Could not create login");
    }
    profile_id = created.user.id;

    const { error: pErr } = await admin.from("bms_profiles").upsert(
      {
        id: profile_id,
        email: authEmail,
        full_name: resident.full_name,
        phone: phone ?? null,
        role: "resident" as const,
        building_id: buildingId,
        is_active: true,
      },
      { onConflict: "id" },
    );
    if (pErr) throw new Error(pErr.message);
  }

  // 4. Link the auth user to the resident row + sync phone/email back
  const { error: linkErr } = await admin
    .from("bms_residents")
    .update({
      profile_id,
      phone: phone ?? resident.phone,
      email: realEmail ?? resident.email,
    })
    .eq("id", residentId);
  if (linkErr) throw new Error(linkErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "resident.login.create",
    entity: "resident",
    entity_id: residentId,
    meta: { profile_id, username_kind: phone ? "phone" : "email" },
  });

  revalidatePath("/admin/residents");
  revalidatePath(`/admin/residents/${residentId}`);
  return {
    username: phone ?? realEmail!,
    username_kind: phone ? "phone" : "email",
    password,
  };
}

export async function resetResidentPassword(
  residentId: string,
): Promise<LoginResult> {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const admin = createAdminClient();

  const { data: resident, error: rErr } = await admin
    .from("bms_residents")
    .select("id, profile_id, bms_profiles:profile_id(email, phone)")
    .eq("id", residentId)
    .eq("building_id", buildingId)
    .single();
  if (rErr || !resident) throw new Error("Resident not found");
  if (!resident.profile_id) throw new Error("Resident has no login yet");

  // Supabase typing returns the joined row as either object or array depending
  // on cardinality assumptions — normalize.
  type ProfileLite = { email: string | null; phone: string | null };
  const joined = resident.bms_profiles as ProfileLite | ProfileLite[] | null;
  const profileRow = Array.isArray(joined) ? joined[0] : joined;
  if (!profileRow) throw new Error("Profile not found for resident");

  const password = generatePassword();
  const { error: pwErr } = await admin.auth.admin.updateUserById(
    resident.profile_id,
    { password },
  );
  if (pwErr) throw new Error(pwErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "resident.login.reset",
    entity: "resident",
    entity_id: residentId,
  });

  revalidatePath("/admin/residents");
  revalidatePath(`/admin/residents/${residentId}`);

  // Prefer mobile in the username return (matches what we tell residents to type)
  const username = profileRow.phone ?? profileRow.email ?? "";
  return {
    username,
    username_kind: profileRow.phone ? "phone" : "email",
    password,
  };
}

export async function revokeResidentLogin(residentId: string): Promise<void> {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const admin = createAdminClient();

  const { data: resident, error: rErr } = await admin
    .from("bms_residents")
    .select("id, profile_id")
    .eq("id", residentId)
    .eq("building_id", buildingId)
    .single();
  if (rErr || !resident) throw new Error("Resident not found");
  if (!resident.profile_id) return; // Already revoked — idempotent

  const profileId = resident.profile_id;

  // 1. Unlink the resident row first so the row remains intact
  await admin
    .from("bms_residents")
    .update({ profile_id: null })
    .eq("id", residentId);

  // 2. Check if this profile is still used elsewhere (same person on another flat)
  const { data: stillLinked } = await admin
    .from("bms_residents")
    .select("id")
    .eq("profile_id", profileId)
    .limit(1);

  // 3. If no other resident row references this profile, deactivate the auth user.
  //    We keep the bms_profiles row + audit history (do not delete) — only flip
  //    is_active so the human can be re-enabled later without re-onboarding.
  if (!stillLinked || stillLinked.length === 0) {
    await admin
      .from("bms_profiles")
      .update({ is_active: false })
      .eq("id", profileId);
    // Ban the auth user — sets banned_until to far future, blocks all sign-ins.
    await admin.auth.admin.updateUserById(profileId, {
      ban_duration: "876000h", // ~100 years
    });
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "resident.login.revoke",
    entity: "resident",
    entity_id: residentId,
    meta: {
      profile_id: profileId,
      still_linked_elsewhere: Boolean(stillLinked && stillLinked.length > 0),
    },
  });

  revalidatePath("/admin/residents");
  revalidatePath(`/admin/residents/${residentId}`);
}
