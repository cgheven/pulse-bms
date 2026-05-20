"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

/**
 * Union-side notice creation.
 * Lives under app/actions because the union portal needs to publish notices
 * for its own building. RLS allows union role to insert notices scoped to
 * their building_id.
 */
export async function createUnionNotice(input: {
  title: string;
  body: string;
  notice_type?: "general" | "urgent" | "maintenance" | "event";
  pinned?: boolean;
  expires_at?: string | null;
}) {
  await requireNotDemo();
  const { user, profile } = await requireRole(["union", "admin", "super_admin"]);
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
    meta: { title: input.title },
  });

  revalidatePath("/union/notices");
  return data;
}

export async function deleteUnionNotice(id: string) {
  await requireNotDemo();
  const { user, profile } = await requireRole(["union", "admin", "super_admin"]);
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
  revalidatePath("/union/notices");
}
