"use server";

// Team-member (sales role) server actions.
//
// "Team members" are restricted users created by super_admin whose ONLY
// accessible surface is the Leads CRM. They live alongside the four
// existing roles (super_admin / admin / union / resident) under the role
// value 'sales'. They are NOT tied to a building_id — leads are
// pre-customer entities.
//
// Every action here is gated to super_admin (NEVER callable by a sales
// user themselves). Sub-routes under /super-admin/teams* will also reject
// any non-super_admin via requireRole().

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { normalizePkPhone } from "@/lib/pk-phone";
import { revalidatePath } from "next/cache";

// v1 only exposes the `sales` role here so the dropdown doesn't pollute
// existing role lifecycles (admin / union / resident have their own
// management surfaces). The literal is future-extensible — add more
// values as we grow the team-member concept.
export type TeamRole = "sales";

export type TeamMemberInput = {
  full_name: string;
  /**
   * Optional. When blank we synthesize `t-<canonical-phone>@team.pulse.app`
   * so Supabase Auth (which requires email) has something to key on.
   * The mobile is what the team member actually uses to identify
   * themselves — the synth email is an internal login handle.
   */
  email?: string | null;
  /** Required — primary contact + login identifier for the team member. */
  phone: string;
  password: string;
  role: TeamRole;
};

const TEAMS_PATH = "/super-admin/teams";

function isValidEmail(s: string): boolean {
  // Cheap RFC-lite check; the real validator is Supabase Auth itself.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * Create a new sales-team member.
 *
 * 1. Create the auth user (email pre-confirmed so they can log in now).
 * 2. Insert their bms_profiles row with role='sales' + building_id=null.
 * 3. If the profile insert fails, ROLL BACK the auth user so we don't
 *    leak an orphaned auth.users entry (no cascade to fall back on).
 * 4. Audit-log the creation.
 */
export async function createTeamMember(input: TeamMemberInput) {
  await requireNotDemo();
  const { user, profile } = await requireRole("super_admin");

  const full_name = input.full_name?.trim();
  const rawPhone = input.phone?.trim() ?? "";
  const canonicalPhone = normalizePkPhone(rawPhone);
  const rawEmail = input.email?.trim().toLowerCase() ?? "";
  // Email is optional — synthesize one from the phone so Supabase Auth
  // (which requires email) has a stable internal identifier. Domain is
  // `team.pulse.app` to make the origin obvious in the auth table.
  const email = rawEmail
    ? rawEmail
    : canonicalPhone
      ? `t-${canonicalPhone}@team.pulse.app`
      : "";
  const password = input.password ?? "";
  const role: TeamRole = input.role ?? "sales";

  if (!full_name) throw new Error("Full name is required.");
  if (!canonicalPhone || canonicalPhone.length < 10) {
    throw new Error("A valid mobile number is required.");
  }
  if (rawEmail && !isValidEmail(rawEmail)) {
    throw new Error(
      `"${rawEmail}" doesn't look like a complete email (missing domain or .com/.me/etc). Add the rest, or leave the field blank to auto-generate one from the mobile number.`,
    );
  }
  if (!email) throw new Error("Could not derive a login identifier.");
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  // Hard-stop guard so this action never grows into a back-door for
  // creating super_admin / admin / union / resident profiles. Use the
  // existing admin invitation flow for those.
  if (role !== "sales") {
    throw new Error("Only sales-team members can be created from here.");
  }

  const admin = createAdminClient();

  // Refuse early if email OR phone is already in use. Either collision
  // would cause a downstream crash; surface a clear error now.
  const { data: existingByEmail, error: emailLookupErr } = await admin
    .from("bms_profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  if (emailLookupErr) throw new Error(emailLookupErr.message);
  if (existingByEmail) {
    throw new Error(
      rawEmail
        ? "A user with this email already exists. Pick a different address."
        : "A team member with this mobile number already exists.",
    );
  }
  const { data: existingByPhone, error: phoneLookupErr } = await admin
    .from("bms_profiles")
    .select("id, phone")
    .eq("phone", canonicalPhone)
    .maybeSingle();
  if (phoneLookupErr) throw new Error(phoneLookupErr.message);
  if (existingByPhone) {
    throw new Error(
      "A user with this mobile number already exists.",
    );
  }

  // 1. Create auth user.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (authErr || !created?.user) {
    throw new Error(authErr?.message ?? "Could not create auth user.");
  }
  const newUserId = created.user.id;

  // 2. Upsert profile row. A `handle_new_user` trigger on auth.users
  // may have already auto-created a stub bms_profiles row when we
  // called createUser() above — upsert handles either case (insert if
  // missing, update if the trigger beat us to it). Use the admin
  // client so RLS doesn't reject the write.
  const { error: profErr } = await admin
    .from("bms_profiles")
    .upsert(
      {
        id: newUserId,
        email,
        full_name,
        phone: canonicalPhone,
        role,
        building_id: null,
        is_active: true,
        is_demo: false,
      },
      { onConflict: "id" },
    );
  if (profErr) {
    // 3. Rollback orphaned auth user. If the rollback ITSELF fails the
    // auth user is left dangling — log + audit so ops can clean it up.
    // We still throw the ORIGINAL profile error since that's the
    // actionable info for the caller.
    try {
      await admin.auth.admin.deleteUser(newUserId);
    } catch (rollbackErr) {
      console.error("[createTeamMember] rollback deleteUser failed", {
        userId: newUserId,
        error: rollbackErr,
      });
      // Best-effort audit so this orphan becomes traceable.
      try {
        await writeAuditLog({
          actor_id: user.id,
          actor_email: user.email,
          actor_role: profile.role,
          action: "team.create.rollback_failed",
          entity: "auth_user",
          entity_id: newUserId,
          meta: {
            error:
              rollbackErr instanceof Error
                ? rollbackErr.message
                : String(rollbackErr),
          },
        });
      } catch {
        /* if even the audit log fails, just continue */
      }
    }
    throw new Error(profErr.message);
  }

  // 4. Audit log.
  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action: "team.create",
    entity: "profile",
    entity_id: newUserId,
    meta: { email, phone: canonicalPhone, role, full_name },
  });

  revalidatePath(TEAMS_PATH);
  return {
    id: newUserId,
    email,
    phone: canonicalPhone,
    full_name,
    // Indicates whether the email was operator-provided vs synthesized
    // from the mobile. Surfaced so the UI can show a different "share
    // these credentials" hint when there's no real email.
    synthesized_email: !rawEmail,
  };
}

export async function deactivateTeamMember(profileId: string) {
  return setTeamMemberActive(profileId, false);
}

export async function reactivateTeamMember(profileId: string) {
  return setTeamMemberActive(profileId, true);
}

async function setTeamMemberActive(profileId: string, isActive: boolean) {
  await requireNotDemo();
  const { user, profile } = await requireRole("super_admin");
  if (!profileId) throw new Error("Team member id required.");

  const admin = createAdminClient();
  const { data: target, error: tErr } = await admin
    .from("bms_profiles")
    .select("id, role, email, is_active")
    .eq("id", profileId)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!target) throw new Error("Team member not found.");
  // Lock the surface — this action only manages sales users.
  if (target.role !== "sales") {
    throw new Error(
      "This action is for sales-team members only. Use the Admins page for building admins.",
    );
  }

  const wasActive = target.is_active === true;

  const { error } = await admin
    .from("bms_profiles")
    .update({ is_active: isActive })
    .eq("id", profileId);
  if (error) throw new Error(error.message);

  // On deactivation, also invalidate every session the user holds so
  // their JWT can't continue to be used until expiry. The is_active
  // flip is the primary effect — if the global signOut fails we log it
  // but don't block the action.
  if (wasActive && !isActive) {
    try {
      await admin.auth.admin.signOut(profileId, "global");
    } catch (signOutErr) {
      console.error(
        "[setTeamMemberActive] global signOut failed after deactivate",
        { userId: profileId, error: signOutErr },
      );
    }
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action: isActive ? "team.activate" : "team.deactivate",
    entity: "profile",
    entity_id: profileId,
    meta: { email: target.email, is_active: isActive },
  });

  revalidatePath(TEAMS_PATH);
}

/**
 * Hard-delete a sales-team member. Removes their auth user (which
 * cascades to bms_profiles via the FK on profile.id -> auth.users.id),
 * and as a safety net drops the bms_profiles row too in case the FK
 * isn't set to cascade in older deployments.
 *
 * Refuses to delete:
 *   - the caller themselves
 *   - anyone whose role is not 'sales' (admins/union/residents go
 *     through their own management surface)
 */
export async function deleteTeamMember(profileId: string) {
  await requireNotDemo();
  const { user, profile } = await requireRole("super_admin");
  if (!profileId) throw new Error("Team member id required.");
  if (profileId === user.id) {
    throw new Error("You cannot delete your own account.");
  }

  const admin = createAdminClient();
  const { data: target, error: tErr } = await admin
    .from("bms_profiles")
    .select("id, email, full_name, role")
    .eq("id", profileId)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!target) throw new Error("Team member not found.");
  if (target.role !== "sales") {
    throw new Error(
      "This action is for sales-team members only. Use the Admins page for building admins.",
    );
  }

  // Belt-and-braces: explicitly sign out every session for this user
  // BEFORE we delete. `deleteUser` already invalidates sessions, but
  // doing this first means an in-flight request from the user is
  // closed before the row disappears, avoiding ambiguous RLS errors.
  try {
    await admin.auth.admin.signOut(profileId, "global");
  } catch (signOutErr) {
    console.error("[deleteTeamMember] global signOut failed", {
      userId: profileId,
      error: signOutErr,
    });
  }

  // Delete the auth user — bms_profiles row cascades on auth.users delete.
  const { error: delErr } = await admin.auth.admin.deleteUser(profileId);
  if (delErr) throw new Error(delErr.message);

  // Defensive: if no cascade exists on the bms_profiles FK, drop the row too.
  await admin.from("bms_profiles").delete().eq("id", profileId);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action: "team.delete",
    entity: "profile",
    entity_id: profileId,
    meta: {
      email: target.email,
      full_name: target.full_name,
      role: target.role,
    },
  });

  revalidatePath(TEAMS_PATH);
}
