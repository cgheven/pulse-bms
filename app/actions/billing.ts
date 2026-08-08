"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { revalidatePath } from "next/cache";

function firstOfMonth(yyyyMm: string): string {
  // yyyyMm: "2026-05"
  return `${yyyyMm}-01`;
}


function buildInvoiceNumber(buildingPrefix: string, flatNumber: string, ym: string) {
  // INV-{building}-{flat}-{YYYYMM}
  const monthKey = ym.replace("-", "");
  return `INV-${buildingPrefix}-${flatNumber}-${monthKey}`.toUpperCase();
}

export async function generateMonthlyInvoices(params: { month: string }) {
  // month: "YYYY-MM"
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const billing_month = firstOfMonth(params.month);

  const { data: building } = await supabase
    .from("bms_buildings")
    .select("name, monthly_fee_default, invoice_due_day")
    .eq("id", buildingId)
    .single();

  // Use the building's configured due day (1–28); fall back to 10 if not set.
  const dueDay = Math.min(28, Math.max(1, Number(building?.invoice_due_day ?? 10)));
  const due_date = `${params.month}-${String(dueDay).padStart(2, "0")}`;
  const buildingPrefix = (building?.name ?? "B").slice(0, 3).replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BLD";
  const defaultFee = Number(building?.monthly_fee_default ?? 3000);

  // Fetch flats — only "active" — for our purposes, non-vacant
  const { data: flats, error: flatsErr } = await supabase
    .from("bms_flats")
    .select("id, flat_number, monthly_fee, ownership_type")
    .eq("building_id", buildingId);
  if (flatsErr) throw new Error(flatsErr.message);

  // Existing invoices for this month
  const { data: existing } = await supabase
    .from("bms_invoices")
    .select("flat_id")
    .eq("building_id", buildingId)
    .eq("billing_month", billing_month);
  const existingSet = new Set((existing ?? []).map((r) => r.flat_id));

  const toInsert: Array<{
    building_id: string;
    flat_id: string;
    invoice_number: string;
    billing_month: string;
    amount: number;
    status: string;
    due_date: string;
  }> = [];

  for (const f of flats ?? []) {
    if (f.ownership_type === "vacant") continue;
    if (existingSet.has(f.id)) continue;
    const amount = Number(f.monthly_fee ?? defaultFee);
    toInsert.push({
      building_id: buildingId,
      flat_id: f.id,
      invoice_number: buildInvoiceNumber(buildingPrefix, f.flat_number, params.month),
      billing_month,
      amount,
      status: "pending",
      due_date,
    });
  }

  const vacantCount = (flats ?? []).filter(
    (f) => f.ownership_type === "vacant",
  ).length;
  const alreadyBilled = existingSet.size;

  let inserted = 0;
  let creditsApplied = 0;
  let creditsAmount = 0;
  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from("bms_invoices")
      .insert(toInsert)
      .select("id, flat_id, amount, billing_month, invoice_number");
    if (error) throw new Error(error.message);
    inserted = data?.length ?? 0;

    // Settle each new invoice against any advance the flat is holding, and
    // restate what it owes.
    //
    // Both jobs belong to `bms_apply_flat_credits`, one transaction per
    // invoice. This used to be done here in ~8 sequential round trips and it
    // got two things wrong. It inserted a fresh `credit_carryforward` payment
    // row for the money being consumed — but the cash had already been
    // counted on the day the resident handed it over, so every report that
    // sums bms_payments saw it twice. And it nudged outstanding_dues by hand,
    // which is why 11 flats had drifted by the time this was written. The
    // function re-attaches the advance row that already holds the money, and
    // rebuilds dues from the invoices themselves.
    for (const row of data ?? []) {
      const { data: applied, error: applyErr } = await supabase.rpc(
        "bms_apply_flat_credits",
        {
          p_building_id: buildingId,
          p_flat_id: row.flat_id,
          p_invoice_id: row.id,
        },
      );
      if (applyErr) throw new Error(applyErr.message);

      const res = applied as { applied: number; count: number } | null;
      creditsAmount += Number(res?.applied ?? 0);
      creditsApplied += Number(res?.count ?? 0);
    }
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "billing.generate_month",
    entity: "invoice",
    meta: {
      month: params.month,
      count: inserted,
      credits_applied_count: creditsApplied,
      credits_applied_amount: creditsAmount,
    },
  });

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
  revalidatePath("/admin/flats");
  // Auto-applied credits change the resident dues page (open-credit banner
  // disappears or shrinks) and the resident dashboard summary. Without
  // these revalidations the resident sees stale data until they hard-refresh.
  revalidatePath("/resident");
  revalidatePath("/resident/dues");
  return {
    inserted,
    alreadyBilled,
    vacantCount,
    creditsApplied,
    creditsAmount,
  };
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
