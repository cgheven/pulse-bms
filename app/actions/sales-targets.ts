"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export type SalesTargets = {
  daily_target: number | null;
  weekly_target: number | null;
  monthly_target: number | null;
};

export async function getSalesTargets(): Promise<SalesTargets> {
  await requireRole(["super_admin", "sales"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("bms_sales_targets")
    .select("daily_target, weekly_target, monthly_target")
    .eq("id", 1)
    .maybeSingle();
  return {
    daily_target: data?.daily_target ?? null,
    weekly_target: data?.weekly_target ?? null,
    monthly_target: data?.monthly_target ?? null,
  };
}

export async function updateSalesTargets(targets: SalesTargets): Promise<void> {
  const { profile } = await requireRole(["super_admin"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_sales_targets")
    .update({
      daily_target: targets.daily_target,
      weekly_target: targets.weekly_target,
      monthly_target: targets.monthly_target,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  await writeAuditLog({
    actor_id: profile.id,
    actor_email: profile.email,
    actor_role: profile.role,
    action: "update_sales_targets",
    entity: "sales_targets",
    entity_id: "1",
    building_id: profile.building_id,
    meta: targets as unknown as Record<string, unknown>,
  });
  revalidatePath("/super-admin/leads");
}
