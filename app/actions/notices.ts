"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export type NoticeType =
  | "general"
  | "dues_reminder"
  | "meeting"
  | "election"
  | "emergency";

export type NoticeInput = {
  title: string;
  body: string;
  notice_type?: NoticeType;
  pinned?: boolean;
  expires_at?: string | null;
};

export async function createNotice(input: NoticeInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bms_notices")
    .insert({
      building_id: profile.building_id,
      title: input.title,
      body: input.body,
      notice_type: input.notice_type ?? "general",
      pinned: input.pinned ?? false,
      expires_at: input.expires_at ?? null,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "notice.create",
    entity: "notice",
    entity_id: data.id,
    meta: input as unknown as Record<string, unknown>,
  });

  revalidatePath("/admin/notices");
  return data;
}

export async function updateNotice(id: string, input: Partial<NoticeInput>) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bms_notices")
    .update(input)
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
    action: "notice.update",
    entity: "notice",
    entity_id: id,
    meta: input as Record<string, unknown>,
  });

  revalidatePath("/admin/notices");
  return data;
}

export async function deleteNotice(id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_notices")
    .delete()
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "notice.delete",
    entity: "notice",
    entity_id: id,
  });

  revalidatePath("/admin/notices");
}
