"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { generateMaintenanceInvoices } from "@/lib/maintenance-invoices";
import { revalidatePath } from "next/cache";

/**
 * Manual month generation (kept as a server action for completeness).
 * Invoices are now generated automatically — monthly by the cron and lazily
 * when an admin first opens the current month — so the UI no longer exposes a
 * button; the heavy lifting lives in lib/maintenance-invoices.ts.
 */
export async function generateMonthlyInvoices(params: { month: string }) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const result = await generateMaintenanceInvoices(supabase, buildingId, params.month);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "billing.generate_month",
    entity: "invoice",
    meta: {
      month: params.month,
      count: result.inserted,
      credits_applied_count: result.creditsApplied,
      credits_applied_amount: result.creditsAmount,
    },
  });

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
  revalidatePath("/admin/flats");
  revalidatePath("/resident");
  revalidatePath("/resident/dues");
  return result;
}

export async function waiveInvoice(id: string, reason?: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const { data: inv } = await supabase
    .from("bms_invoices")
    .select("flat_id, amount, status")
    .eq("id", id)
    .eq("building_id", buildingId)
    .single();
  if (!inv) throw new Error("Invoice not found");

  const { error } = await supabase
    .from("bms_invoices")
    .update({ status: "waived", notes: reason ?? null })
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  // A waived invoice drops out of what the flat owes. Rebuilt from the
  // remaining invoices rather than subtracted — the old subtraction had to
  // reason about how much of this invoice had already been paid, and getting
  // that wrong left the error in the cache forever.
  await supabase.rpc("bms_recalc_flat_dues", {
    p_building_id: buildingId,
    p_flat_id: inv.flat_id,
  });

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "invoice.waive",
    entity: "invoice",
    entity_id: id,
    meta: { reason },
  });

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
  revalidatePath("/resident");
  revalidatePath("/resident/dues");
  return { ok: true };
}

export async function deleteInvoice(id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const { data: inv } = await supabase
    .from("bms_invoices")
    .select("flat_id, amount, status")
    .eq("id", id)
    .eq("building_id", buildingId)
    .single();
  if (!inv) throw new Error("Invoice not found");

  // Refuse to delete if there are payments. Scope by building_id as
  // defence-in-depth — RLS already filters, but pinning the building keeps
  // the count safe even if a future RLS regression widens visibility.
  const { count } = await supabase
    .from("bms_payments")
    .select("*", { count: "exact", head: true })
    .eq("invoice_id", id)
    .eq("building_id", buildingId);
  if ((count ?? 0) > 0) throw new Error("Cannot delete invoice with payments");

  const { error } = await supabase
    .from("bms_invoices")
    .delete()
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  // The invoice is gone, so what the flat owes is whatever the remaining
  // invoices say. Rebuilt rather than subtracted, for the same reason as
  // waiveInvoice above.
  await supabase.rpc("bms_recalc_flat_dues", {
    p_building_id: buildingId,
    p_flat_id: inv.flat_id,
  });

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "invoice.delete",
    entity: "invoice",
    entity_id: id,
  });

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
  revalidatePath("/resident");
  revalidatePath("/resident/dues");
  return { ok: true };
}

export async function updateInvoiceDueDay(day: number) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  if (!Number.isInteger(day) || day < 1 || day > 28)
    throw new Error("Due day must be a whole number between 1 and 28.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("bms_update_invoice_due_day", { p_due_day: day });
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "building.invoice_due_day.update",
    entity: "building",
    entity_id: buildingId,
    meta: { invoice_due_day: day },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/union/settings");
}
