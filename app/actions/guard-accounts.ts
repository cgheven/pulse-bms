"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { normalizePhone, syntheticEmailFromPhone } from "@/lib/phone";

/* ── helpers ──────────────────────────────────────────────────────────── */

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/* ── createGuardAccount ───────────────────────────────────────────────── */

export async function createGuardAccount(input: {
  name: string;
  email: string;
  password: string;
}) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned to your account.");

  // Validate inputs
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const { password } = input;

  if (!name) throw new Error("Full name is required.");
  if (!isValidEmail(email)) throw new Error("Please enter a valid email address.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const admin = createAdminClient();

  // Create the auth user with a confirmed email — no invite flow
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "Failed to create guard account.");
  }

  const newUserId = authData.user.id;

  // Insert profile row
  const { error: profileError } = await admin.from("bms_profiles").insert({
    id: newUserId,
    email,
    full_name: name,
    role: "guard",
    building_id: profile.building_id,
  });

  if (profileError) {
    // Clean up the auth user so we don't leave orphans
    await admin.auth.admin.deleteUser(newUserId);
    throw new Error(profileError.message);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "guard.create",
    entity: "profile",
    entity_id: newUserId,
    meta: { email, full_name: name },
  });

  revalidatePath("/admin/staff");
  return { id: newUserId, email, full_name: name };
}

/* ── deleteGuardAccount ───────────────────────────────────────────────── */

export async function deleteGuardAccount(guardId: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned to your account.");

  const admin = createAdminClient();

  // Verify the guard belongs to this building and has role=guard
  const { data: guardProfile, error: fetchError } = await admin
    .from("bms_profiles")
    .select("id, full_name, email, role, building_id")
    .eq("id", guardId)
    .single();

  if (fetchError || !guardProfile) {
    throw new Error("Guard not found.");
  }
  if (guardProfile.building_id !== profile.building_id) {
    throw new Error("You can only delete guards in your own building.");
  }
  if (guardProfile.role !== "guard") {
    throw new Error("This account is not a guard.");
  }

  // Deleting the auth user cascades to bms_profiles via FK
  const { error: deleteError } = await admin.auth.admin.deleteUser(guardId);
  if (deleteError) throw new Error(deleteError.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "guard.delete",
    entity: "profile",
    entity_id: guardId,
    meta: { email: guardProfile.email, full_name: guardProfile.full_name },
  });

  revalidatePath("/admin/staff");
}

/* ── resetGuardPassword ───────────────────────────────────────────────── */

export async function resetGuardPassword(guardId: string, newPassword: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned to your account.");

  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");

  const admin = createAdminClient();

  // Verify same building + guard role
  const { data: guardProfile, error: fetchError } = await admin
    .from("bms_profiles")
    .select("id, email, full_name, role, building_id")
    .eq("id", guardId)
    .single();

  if (fetchError || !guardProfile) {
    throw new Error("Guard not found.");
  }
  if (guardProfile.building_id !== profile.building_id) {
    throw new Error("You can only reset passwords for guards in your own building.");
  }
  if (guardProfile.role !== "guard") {
    throw new Error("This account is not a guard.");
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(guardId, {
    password: newPassword,
  });
  if (updateError) throw new Error(updateError.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "guard.password_reset",
    entity: "profile",
    entity_id: guardId,
    meta: { email: guardProfile.email, full_name: guardProfile.full_name },
  });
}

/* ── createGuardAccountForStaff ───────────────────────────────────────── */

export async function createGuardAccountForStaff(
  staffId: string,
  input: { phone: string; password: string },
) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned to your account.");

  if (!isValidUUID(staffId)) throw new Error("Invalid staff ID.");

  const canonicalPhone = normalizePhone(input.phone);
  if (!canonicalPhone) throw new Error("Please enter a valid Pakistani mobile number (e.g. 0300-1234567).");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters.");

  // Synthetic email is the stable auth identifier — never shown to the guard.
  const syntheticEmail = syntheticEmailFromPhone(canonicalPhone);

  const admin = createAdminClient();

  // Fetch staff record and verify ownership + role + no existing login
  const { data: staffRow, error: staffFetchError } = await admin
    .from("bms_staff")
    .select("id, full_name, role, building_id, profile_id")
    .eq("id", staffId)
    .single();

  if (staffFetchError || !staffRow) throw new Error("Staff member not found.");
  if (staffRow.building_id !== profile.building_id) {
    throw new Error("You can only manage staff in your own building.");
  }
  if (staffRow.role !== "chowkidar") {
    throw new Error("Guard logins can only be created for Chowkidar staff.");
  }
  if (staffRow.profile_id) {
    throw new Error("This staff member already has a login account.");
  }

  // Create the auth user with a synthetic email derived from the mobile number.
  // The trigger bms_handle_new_user will auto-insert a bms_profiles row
  // (role='resident') — we then UPDATE it to set role='guard' + building_id.
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: staffRow.full_name },
  });

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "Failed to create guard account.");
  }

  const newUserId = authData.user.id;

  // Update the auto-created profile row to set the correct role, building, phone.
  const { error: profileError } = await admin
    .from("bms_profiles")
    .update({
      full_name: staffRow.full_name,
      role: "guard",
      building_id: profile.building_id,
      phone: canonicalPhone,
    })
    .eq("id", newUserId);

  if (profileError) {
    await admin.auth.admin.deleteUser(newUserId);
    throw new Error(profileError.message);
  }

  // Link the staff row to the new auth user
  const { error: staffUpdateError } = await admin
    .from("bms_staff")
    .update({ profile_id: newUserId })
    .eq("id", staffId);

  if (staffUpdateError) {
    await admin.from("bms_profiles").delete().eq("id", newUserId);
    await admin.auth.admin.deleteUser(newUserId);
    throw new Error(staffUpdateError.message);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "guard.create",
    entity: "profile",
    entity_id: newUserId,
    meta: { staff_id: staffId, phone: canonicalPhone, full_name: staffRow.full_name },
  });

  revalidatePath("/admin/staff");
  return { id: newUserId, phone: canonicalPhone };
}

/* ── createAccountantAccountForStaff ─────────────────────────────────── */

export async function createAccountantAccountForStaff(
  staffId: string,
  input: { email: string; password: string },
) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin", "union"]);
  if (!profile.building_id) throw new Error("No building assigned to your account.");

  if (!isValidUUID(staffId)) throw new Error("Invalid staff ID.");

  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error("Please enter a valid email address.");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters.");

  const admin = createAdminClient();

  // Fetch staff record and verify ownership + role + no existing login
  const { data: staffRow, error: staffFetchError } = await admin
    .from("bms_staff")
    .select("id, full_name, role, building_id, profile_id")
    .eq("id", staffId)
    .single();

  if (staffFetchError || !staffRow) throw new Error("Staff member not found.");
  if (staffRow.building_id !== profile.building_id) {
    throw new Error("You can only manage staff in your own building.");
  }
  if (staffRow.role === "chowkidar") {
    throw new Error("Chowkidars use guard logins — use the Guard Login button instead.");
  }
  if (staffRow.profile_id) {
    throw new Error("This staff member already has a login account.");
  }

  // Create the auth user — email confirmed, no invite flow needed.
  // The trigger bms_handle_new_user auto-inserts a bms_profiles row (role='resident');
  // we then UPDATE it to role='accountant' + correct building_id.
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: staffRow.full_name },
  });

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "Failed to create accountant account.");
  }

  const newUserId = authData.user.id;

  // Update the auto-created profile row
  const { error: profileError } = await admin
    .from("bms_profiles")
    .update({
      full_name: staffRow.full_name,
      role: "accountant",
      building_id: profile.building_id,
    })
    .eq("id", newUserId);

  if (profileError) {
    await admin.auth.admin.deleteUser(newUserId);
    throw new Error(profileError.message);
  }

  // Link the staff row to the new auth user
  const { error: staffUpdateError } = await admin
    .from("bms_staff")
    .update({ profile_id: newUserId })
    .eq("id", staffId);

  if (staffUpdateError) {
    await admin.from("bms_profiles").delete().eq("id", newUserId);
    await admin.auth.admin.deleteUser(newUserId);
    throw new Error(staffUpdateError.message);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "accountant.create",
    entity: "profile",
    entity_id: newUserId,
    meta: { staff_id: staffId, email, full_name: staffRow.full_name },
  });

  revalidatePath("/admin/staff");
  revalidatePath("/union/staff");
  return { id: newUserId, email };
}

/* ── revokeAccountantAccountForStaff ─────────────────────────────────── */

export async function revokeAccountantAccountForStaff(staffId: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin", "union"]);
  if (!profile.building_id) throw new Error("No building assigned to your account.");

  if (!isValidUUID(staffId)) throw new Error("Invalid staff ID.");

  const admin = createAdminClient();

  const { data: staffRow, error: staffFetchError } = await admin
    .from("bms_staff")
    .select("id, full_name, role, building_id, profile_id")
    .eq("id", staffId)
    .single();

  if (staffFetchError || !staffRow) throw new Error("Staff member not found.");
  if (staffRow.building_id !== profile.building_id) {
    throw new Error("You can only manage staff in your own building.");
  }
  if (staffRow.role === "chowkidar") {
    throw new Error("Use the Guard Login controls to revoke a chowkidar's login.");
  }
  if (!staffRow.profile_id) {
    throw new Error("This staff member does not have a login account.");
  }

  const revokedProfileId = staffRow.profile_id as string;

  // Verify the profile is actually an accountant (not a guard or resident)
  const { data: profileRow } = await admin
    .from("bms_profiles")
    .select("role")
    .eq("id", revokedProfileId)
    .single();

  if (profileRow && profileRow.role !== "accountant") {
    throw new Error("This account is not an accountant login.");
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(revokedProfileId);
  if (deleteError) throw new Error(deleteError.message);

  const { error: staffUpdateError } = await admin
    .from("bms_staff")
    .update({ profile_id: null })
    .eq("id", staffId);

  if (staffUpdateError) {
    console.error("revokeAccountantAccountForStaff: failed to clear profile_id", staffUpdateError);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "accountant.revoke",
    entity: "profile",
    entity_id: revokedProfileId,
    meta: { staff_id: staffId, full_name: staffRow.full_name },
  });

  revalidatePath("/admin/staff");
  revalidatePath("/union/staff");
}

/* ── revokeGuardAccountForStaff ───────────────────────────────────────── */

export async function revokeGuardAccountForStaff(staffId: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned to your account.");

  if (!isValidUUID(staffId)) throw new Error("Invalid staff ID.");

  const admin = createAdminClient();

  // Fetch staff record
  const { data: staffRow, error: staffFetchError } = await admin
    .from("bms_staff")
    .select("id, full_name, role, building_id, profile_id")
    .eq("id", staffId)
    .single();

  if (staffFetchError || !staffRow) throw new Error("Staff member not found.");
  if (staffRow.building_id !== profile.building_id) {
    throw new Error("You can only manage staff in your own building.");
  }
  if (staffRow.role !== "chowkidar") {
    throw new Error("Only Chowkidar staff can have guard logins.");
  }
  if (!staffRow.profile_id) {
    throw new Error("This staff member does not have a login account.");
  }

  const revokedProfileId = staffRow.profile_id as string;

  // Delete the auth user — cascades to bms_profiles via FK ON DELETE CASCADE
  const { error: deleteError } = await admin.auth.admin.deleteUser(revokedProfileId);
  if (deleteError) throw new Error(deleteError.message);

  // Clear the link on the staff row
  const { error: staffUpdateError } = await admin
    .from("bms_staff")
    .update({ profile_id: null })
    .eq("id", staffId);

  if (staffUpdateError) {
    // The auth user is already deleted; just log the partial failure
    console.error("revokeGuardAccountForStaff: failed to clear profile_id on staff row", staffUpdateError);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "guard.revoke",
    entity: "profile",
    entity_id: revokedProfileId,
    meta: { staff_id: staffId, full_name: staffRow.full_name },
  });

  revalidatePath("/admin/staff");
}
