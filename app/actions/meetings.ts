"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export async function createMeeting(input: {
  title: string;
  scheduled_at: string; // ISO string
  location?: string;
  agenda?: string;
}) {
  const { user, profile } = await requireRole(["union", "admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bms_meetings")
    .insert({
      building_id: profile.building_id,
      title: input.title,
      scheduled_at: input.scheduled_at,
      location: input.location ?? null,
      agenda: input.agenda ?? null,
      status: "scheduled",
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
    action: "meeting.create",
    entity: "meeting",
    entity_id: data.id,
    meta: { title: input.title, scheduled_at: input.scheduled_at },
  });

  revalidatePath("/union/meetings");
  return data;
}

export async function updateMeeting(
  id: string,
  input: {
    title?: string;
    scheduled_at?: string;
    location?: string | null;
    agenda?: string | null;
    minutes?: string | null;
    status?: "scheduled" | "completed" | "cancelled";
  }
) {
  const { user, profile } = await requireRole(["union", "admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();
  const payload: Record<string, unknown> = {};
  if (input.title !== undefined) payload.title = input.title;
  if (input.scheduled_at !== undefined) payload.scheduled_at = input.scheduled_at;
  if (input.location !== undefined) payload.location = input.location;
  if (input.agenda !== undefined) payload.agenda = input.agenda;
  if (input.minutes !== undefined) payload.minutes = input.minutes;
  if (input.status !== undefined) payload.status = input.status;

  const { data, error } = await supabase
    .from("bms_meetings")
    .update(payload)
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
    action: "meeting.update",
    entity: "meeting",
    entity_id: id,
    meta: payload,
  });

  revalidatePath("/union/meetings");
  return data;
}

export async function deleteMeeting(id: string) {
  const { user, profile } = await requireRole(["union", "admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_meetings")
    .delete()
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "meeting.delete",
    entity: "meeting",
    entity_id: id,
  });
  revalidatePath("/union/meetings");
}
