"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export type UnionPosition =
  | "president"
  | "vp"
  | "secretary"
  | "treasurer"
  | "member";

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
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();
  const admin = createAdminClient();

  // Promote profile to 'union' role (admin client bypasses RLS).
  const { error: roleErr } = await admin
    .from("bms_profiles")
    .update({ role: "union", building_id: profile.building_id })
    .eq("id", input.profile_id);
  if (roleErr) throw new Error(`Failed to promote profile: ${roleErr.message}`);

  const { data, error } = await supabase
    .from("bms_union_members")
    .insert({
      building_id: profile.building_id,
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
    building_id: profile.building_id,
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
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");

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
    .eq("building_id", profile.building_id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "union.member.update",
    entity: "union_member",
    entity_id: id,
    meta: { ...input },
  });

  revalidatePath("/admin/union");
  return data;
}

export async function removeUnionMember(id: string) {
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();
  const admin = createAdminClient();

  // Fetch the member to find profile_id, then deactivate and revert profile role.
  const { data: member, error: fetchErr } = await supabase
    .from("bms_union_members")
    .select("id, profile_id")
    .eq("id", id)
    .eq("building_id", profile.building_id)
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
    building_id: profile.building_id,
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
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bms_elections")
    .insert({
      building_id: profile.building_id,
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
    building_id: profile.building_id,
    action: "election.create",
    entity: "election",
    entity_id: data.id,
    meta: { ...input },
  });

  revalidatePath("/admin/union");
  return data;
}

export async function openElection(id: string) {
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_elections")
    .update({ status: "open" })
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
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
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_elections")
    .update({ status: "closed", results })
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "election.close",
    entity: "election",
    entity_id: id,
    meta: { results },
  });
  revalidatePath("/admin/union");
}

export async function deleteElection(id: string) {
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_elections")
    .delete()
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "election.delete",
    entity: "election",
    entity_id: id,
  });
  revalidatePath("/admin/union");
}
