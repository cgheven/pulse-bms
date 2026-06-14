"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { normalizePhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";

export type UnionPosition =
  | "president"
  | "vp"
  | "secretary"
  | "treasurer"
  | "member";

export type UnionLoginResult = {
  username: string;
  username_kind: "phone" | "email";
  password: string;
  full_name: string;
};

function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[arr[i] % chars.length];
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Union members
 * ────────────────────────────────────────────────────────────────────────── */

export async function addUnionMember(input: {
  profile_id: string;
  full_name: string;
  position: UnionPosition;
  term_start: string;
  term_end: string;
}) {
  await requireNotDemo();
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const admin = createAdminClient();

  // Verify the target belongs to this building and is a resident before promotion.
  // adminDb bypasses RLS, so we must guard cross-tenant promotion explicitly.
  const { data: targetProfile } = await admin
    .from("bms_profiles")
    .select("id, role, building_id")
    .eq("id", input.profile_id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!targetProfile) throw new Error("User not found in this building.");
  if (targetProfile.role !== "resident") {
    throw new Error("Only residents can be promoted to the Union committee.");
  }

  // Promote profile to 'union' role (admin client bypasses RLS).
  const { error: roleErr } = await admin
    .from("bms_profiles")
    .update({ role: "union", building_id: buildingId })
    .eq("id", input.profile_id);
  if (roleErr) throw new Error(`Failed to promote profile: ${roleErr.message}`);

  const { data, error } = await supabase
    .from("bms_union_members")
    .insert({
      building_id: buildingId,
      profile_id: input.profile_id,
      full_name: input.full_name,
      position: input.position,
      term_start: input.term_start,
      term_end: input.term_end,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "union.member.add",
    entity: "union_member",
    entity_id: data.id,
    meta: { position: input.position, profile_id: input.profile_id },
  });

  revalidatePath("/admin/union");
  return data;
}

export async function updateUnionMember(
  id: string,
  input: { position: UnionPosition; term_start: string; term_end: string; is_active: boolean }
) {
  await requireNotDemo();
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bms_union_members")
    .update({
      position: input.position,
      term_start: input.term_start,
      term_end: input.term_end,
      is_active: input.is_active,
    })
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
    action: "union.member.update",
    entity: "union_member",
    entity_id: id,
    meta: { ...input },
  });

  revalidatePath("/admin/union");
  return data;
}

export async function resetUnionMemberLogin(memberId: string): Promise<UnionLoginResult> {
  await requireNotDemo();
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const admin = createAdminClient();

  const { data: member } = await admin
    .from("bms_union_members")
    .select("id, full_name, profile_id, bms_profiles:profile_id(email, phone)")
    .eq("id", memberId)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!member) throw new Error("Union member not found.");
  if (!member.profile_id) throw new Error("This member has no login account.");

  type ProfileLite = { email: string | null; phone: string | null };
  const joined = member.bms_profiles as ProfileLite | ProfileLite[] | null;
  const profileRow = Array.isArray(joined) ? joined[0] : joined;
  if (!profileRow) throw new Error("Profile not found.");

  const password = generatePassword();
  const { error: pwErr } = await admin.auth.admin.updateUserById(member.profile_id, {
    password,
    ban_duration: "none",
    email_confirm: true,
  });
  if (pwErr) throw new Error(pwErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "union.member.login.reset",
    entity: "union_member",
    entity_id: memberId,
  });

  revalidatePath("/admin/union");

  const username = profileRow.phone ?? profileRow.email ?? "";
  return {
    username,
    username_kind: profileRow.phone ? "phone" : "email",
    password,
    full_name: member.full_name,
  };
}

export async function removeUnionMember(id: string) {
  await requireNotDemo();
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const admin = createAdminClient();

  // Fetch the member to find profile_id, then deactivate and revert profile role.
  const { data: member, error: fetchErr } = await supabase
    .from("bms_union_members")
    .select("id, profile_id")
    .eq("id", id)
    .eq("building_id", buildingId)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);

  const { error: updErr } = await supabase
    .from("bms_union_members")
    .update({ is_active: false })
    .eq("id", id);
  if (updErr) throw new Error(updErr.message);

  if (member.profile_id) {
    await admin
      .from("bms_profiles")
      .update({ role: "resident" })
      .eq("id", member.profile_id);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "union.member.remove",
    entity: "union_member",
    entity_id: id,
  });

  revalidatePath("/admin/union");
}

/* ────────────────────────────────────────────────────────────────────────────
 * Elections
 * ────────────────────────────────────────────────────────────────────────── */

export async function createElection(input: {
  cycle_label: string;
  scheduled_date: string;
}) {
  await requireNotDemo();
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bms_elections")
    .insert({
      building_id: buildingId,
      cycle_label: input.cycle_label,
      scheduled_date: input.scheduled_date,
      status: "scheduled",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "election.create",
    entity: "election",
    entity_id: data.id,
    meta: { ...input },
  });

  revalidatePath("/admin/union");
  return data;
}

export async function openElection(id: string) {
  await requireNotDemo();
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_elections")
    .update({ status: "open" })
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "election.open",
    entity: "election",
    entity_id: id,
  });
  revalidatePath("/admin/union");
}

export async function closeElection(
  id: string,
  results: Record<string, unknown>
) {
  await requireNotDemo();
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_elections")
    .update({ status: "closed", results })
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "election.close",
    entity: "election",
    entity_id: id,
    meta: { results },
  });
  revalidatePath("/admin/union");
}

export async function deleteElection(id: string) {
  await requireNotDemo();
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_elections")
    .delete()
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "election.delete",
    entity: "election",
    entity_id: id,
  });
  revalidatePath("/admin/union");
}

/* ────────────────────────────────────────────────────────────────────────────
 * Building settings — owned by the Union (and Admin/Super Admin on their behalf)
 * ────────────────────────────────────────────────────────────────────────── */

export type BuildingSettingsInput = {
  entry_fee_owner: number;
  entry_fee_tenant: number;
  monthly_fee_default: number;
  utility_cutoff_after_months: number;
  invoice_due_day: number; // 1–28: day of billing month invoices are due
  voting_rule: "majority" | "unanimous";
  expose_defaulter_names: boolean;
  listing_enabled: boolean;
  public_whatsapp: string; // canonical 03xxxxxxxxx or empty
};

export async function updateBuildingSettings(input: BuildingSettingsInput) {
  await requireNotDemo();
  // Only admins may change building settings — union members must not.
  const { profile, user } = await requireRole(["admin"]);
  if (!profile.building_id) throw new Error("No building assigned");

  // App-layer guard rails. The RPC re-validates server-side, but bailing here
  // returns a friendlier error to the form.
  const entry_fee_owner = Number(input.entry_fee_owner);
  const entry_fee_tenant = Number(input.entry_fee_tenant);
  const monthly_fee_default = Number(input.monthly_fee_default);
  const utility_cutoff_after_months = Number(input.utility_cutoff_after_months);
  const invoice_due_day = Number(input.invoice_due_day);

  if (!Number.isFinite(entry_fee_owner) || entry_fee_owner < 0)
    throw new Error("Entry fee (owner) must be a non-negative number");
  if (!Number.isFinite(entry_fee_tenant) || entry_fee_tenant < 0)
    throw new Error("Entry fee (tenant) must be a non-negative number");
  if (!Number.isFinite(monthly_fee_default) || monthly_fee_default < 0)
    throw new Error("Maintenance fee must be a non-negative number");
  if (
    !Number.isInteger(utility_cutoff_after_months) ||
    utility_cutoff_after_months < 1 ||
    utility_cutoff_after_months > 24
  )
    throw new Error("Utility cut-off must be a whole number between 1 and 24");
  if (!Number.isInteger(invoice_due_day) || invoice_due_day < 1 || invoice_due_day > 28)
    throw new Error("Invoice due day must be a whole number between 1 and 28");
  if (input.voting_rule !== "majority" && input.voting_rule !== "unanimous")
    throw new Error("Invalid voting rule");

  // Normalize WhatsApp number to canonical 03xxxxxxxxx (empty if not provided).
  // The RPC re-validates the format but we want a friendly client error too.
  const rawWa = (input.public_whatsapp ?? "").trim();
  const wa = rawWa ? normalizePhone(rawWa) : "";
  if (rawWa && wa === null)
    throw new Error("Public WhatsApp number is not a valid Pakistani mobile (e.g. 0331-1000006)");

  const supabase = await createClient();
  // SECURITY DEFINER RPC enforces the column whitelist server-side — no other
  // bms_buildings columns can be touched even if a caller bypasses this action.
  const { error } = await supabase.rpc("bms_update_building_settings", {
    p_entry_fee_owner: entry_fee_owner,
    p_entry_fee_tenant: entry_fee_tenant,
    p_monthly_fee_default: monthly_fee_default,
    p_utility_cutoff: utility_cutoff_after_months,
    p_voting_rule: input.voting_rule,
    p_expose_defaulter_names: Boolean(input.expose_defaulter_names),
    p_listing_enabled: Boolean(input.listing_enabled),
    p_public_whatsapp: wa ?? "",
  });
  if (error) throw new Error(error.message);

  // invoice_due_day goes through its own SECURITY DEFINER RPC so the column
  // whitelist is enforced server-side — same pattern as bms_update_opening_balance.
  const { error: dueDayErr } = await supabase.rpc("bms_update_invoice_due_day", {
    p_due_day: invoice_due_day,
  });
  if (dueDayErr) throw new Error(dueDayErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "building.settings.update",
    entity: "building",
    entity_id: profile.building_id,
    meta: {
      entry_fee_owner,
      entry_fee_tenant,
      monthly_fee_default,
      utility_cutoff_after_months,
      invoice_due_day,
      voting_rule: input.voting_rule,
      expose_defaulter_names: Boolean(input.expose_defaulter_names),
      listing_enabled: Boolean(input.listing_enabled),
      public_whatsapp: wa,
    },
  });

  revalidatePath("/union/settings");
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/find");
  revalidatePath(`/find/${profile.building_id}`);
  revalidatePath(`/super-admin/buildings/${profile.building_id}`);
}
