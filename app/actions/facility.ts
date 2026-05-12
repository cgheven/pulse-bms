"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export type TaskRecurrence = "weekly" | "monthly" | "quarterly" | "yearly" | null;
export type TaskStatus = "pending" | "in_progress" | "done" | "skipped";
export type ComplaintStatus = "open" | "assigned" | "in_progress" | "resolved";

export type FacilityTaskInput = {
  title: string;
  description?: string | null;
  task_type?: "scheduled" | "one_off";
  category?: string | null;
  recurrence?: TaskRecurrence;
  next_due_date?: string | null;
  assigned_to?: string | null;
  status?: TaskStatus;
};

function advanceDate(iso: string, recurrence: Exclude<TaskRecurrence, null>): string {
  const d = new Date(iso);
  if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  if (recurrence === "quarterly") d.setMonth(d.getMonth() + 3);
  if (recurrence === "yearly") d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}

export async function createFacilityTask(input: FacilityTaskInput) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bms_facility_tasks")
    .insert({
      building_id: profile.building_id,
      title: input.title,
      description: input.description ?? null,
      task_type: input.task_type ?? "scheduled",
      category: input.category ?? null,
      recurrence: input.recurrence ?? null,
      next_due_date: input.next_due_date ?? null,
      assigned_to: input.assigned_to ?? null,
      status: input.status ?? "pending",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "facility_task.create",
    entity: "facility_task",
    entity_id: data.id,
    meta: input as unknown as Record<string, unknown>,
  });

  revalidatePath("/admin/facility");
  return data;
}

export async function updateFacilityTask(id: string, input: Partial<FacilityTaskInput>) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bms_facility_tasks")
    .update({ ...input, updated_at: new Date().toISOString() })
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
    action: "facility_task.update",
    entity: "facility_task",
    entity_id: id,
    meta: input as Record<string, unknown>,
  });

  revalidatePath("/admin/facility");
  return data;
}

export async function markTaskDone(id: string) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("bms_facility_tasks")
    .select("*")
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .single();
  if (!task) throw new Error("Task not found");

  const today = new Date().toISOString().split("T")[0];
  const update: Record<string, unknown> = {
    last_done_date: today,
    updated_at: new Date().toISOString(),
  };

  if (task.recurrence) {
    update.next_due_date = advanceDate(today, task.recurrence as Exclude<TaskRecurrence, null>);
    update.status = "pending";
  } else {
    update.status = "done";
  }

  const { error } = await supabase.from("bms_facility_tasks").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "facility_task.done",
    entity: "facility_task",
    entity_id: id,
    meta: { last_done_date: today, recurrence: task.recurrence },
  });

  revalidatePath("/admin/facility");
}

export async function deleteFacilityTask(id: string) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_facility_tasks")
    .delete()
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "facility_task.delete",
    entity: "facility_task",
    entity_id: id,
  });

  revalidatePath("/admin/facility");
}

export async function assignComplaint(input: {
  id: string;
  assigned_to: string | null;
}) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { error } = await supabase
    .from("bms_complaints")
    .update({
      assigned_to: input.assigned_to,
      status: input.assigned_to ? "assigned" : "open",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "complaint.assign",
    entity: "complaint",
    entity_id: input.id,
    meta: { assigned_to: input.assigned_to },
  });

  revalidatePath("/admin/facility");
}

export async function updateComplaintStatus(input: {
  id: string;
  status: ComplaintStatus;
  resolution?: string | null;
}) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const update: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.status === "resolved") {
    update.resolution = input.resolution ?? null;
    update.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("bms_complaints")
    .update(update)
    .eq("id", input.id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "complaint.status_change",
    entity: "complaint",
    entity_id: input.id,
    meta: { status: input.status },
  });

  revalidatePath("/admin/facility");
}
