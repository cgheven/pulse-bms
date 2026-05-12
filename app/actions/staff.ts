"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import type { StaffRole } from "@/types";

export type StaffInput = {
  full_name: string;
  role: StaffRole;
  phone?: string | null;
  cnic?: string | null;
  monthly_salary: number;
  join_date?: string | null;
  exit_date?: string | null;
  is_active?: boolean;
  notes?: string | null;
};

export async function createStaff(input: StaffInput) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bms_staff")
    .insert({ ...input, building_id: profile.building_id })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "staff.create",
    entity: "staff",
    entity_id: data.id,
    meta: input as unknown as Record<string, unknown>,
  });

  revalidatePath("/admin/staff");
  return data;
}

export async function updateStaff(id: string, input: Partial<StaffInput>) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bms_staff")
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
    action: "staff.update",
    entity: "staff",
    entity_id: id,
    meta: input as Record<string, unknown>,
  });

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${id}`);
  return data;
}

export async function deleteStaff(id: string) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_staff")
    .delete()
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "staff.delete",
    entity: "staff",
    entity_id: id,
  });

  revalidatePath("/admin/staff");
}

export type AttendanceStatus = "present" | "absent" | "half_day" | "leave";

export async function setAttendance(input: {
  staff_id: string;
  date: string;
  status: AttendanceStatus;
  notes?: string | null;
}) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  // upsert by (staff_id, date)
  const { data: existing } = await supabase
    .from("bms_attendance")
    .select("id")
    .eq("staff_id", input.staff_id)
    .eq("date", input.date)
    .eq("building_id", profile.building_id)
    .maybeSingle();

  let resultId = existing?.id;
  if (existing) {
    const { error } = await supabase
      .from("bms_attendance")
      .update({
        status: input.status,
        notes: input.notes ?? null,
        recorded_by: user.id,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase
      .from("bms_attendance")
      .insert({
        building_id: profile.building_id,
        staff_id: input.staff_id,
        date: input.date,
        status: input.status,
        notes: input.notes ?? null,
        recorded_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    resultId = data.id;
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "attendance.set",
    entity: "attendance",
    entity_id: resultId,
    meta: { staff_id: input.staff_id, date: input.date, status: input.status },
  });

  revalidatePath(`/admin/staff/${input.staff_id}`);
  revalidatePath("/admin/staff");
}

export async function markAllPresentToday() {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const { data: staff } = await supabase
    .from("bms_staff")
    .select("id")
    .eq("building_id", profile.building_id)
    .eq("is_active", true);

  if (!staff?.length) return { count: 0 };

  // fetch existing rows for today
  const { data: existing } = await supabase
    .from("bms_attendance")
    .select("staff_id")
    .eq("building_id", profile.building_id)
    .eq("date", today);
  const existingIds = new Set((existing ?? []).map((r) => r.staff_id));
  const toInsert = staff
    .filter((s) => !existingIds.has(s.id))
    .map((s) => ({
      building_id: profile.building_id!,
      staff_id: s.id,
      date: today,
      status: "present" as const,
      recorded_by: user.id,
    }));

  if (toInsert.length) {
    const { error } = await supabase.from("bms_attendance").insert(toInsert);
    if (error) throw new Error(error.message);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "attendance.mark_all_present",
    entity: "attendance",
    meta: { date: today, count: toInsert.length },
  });

  revalidatePath("/admin/staff");
  return { count: toInsert.length };
}

export async function paySalary(input: {
  staff_id: string;
  pay_month: string; // YYYY-MM-01
  amount: number;
  payment_mode?: string;
  slip_no?: string | null;
  notes?: string | null;
}) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bms_salary_payments")
    .insert({
      building_id: profile.building_id,
      staff_id: input.staff_id,
      pay_month: input.pay_month,
      amount: input.amount,
      payment_date: new Date().toISOString().split("T")[0],
      payment_mode: input.payment_mode ?? "cash",
      slip_no: input.slip_no ?? null,
      notes: input.notes ?? null,
      paid_by: user.id,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "salary.pay",
    entity: "salary_payment",
    entity_id: data.id,
    meta: input as unknown as Record<string, unknown>,
  });

  revalidatePath(`/admin/staff/${input.staff_id}`);
  revalidatePath("/admin/staff");
  return data;
}
