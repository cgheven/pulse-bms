"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

function firstOfMonth(yyyyMm: string): string {
  // yyyyMm: "2026-05"
  return `${yyyyMm}-01`;
}

function dueDateFor(billingMonthIso: string): string {
  // due date = 10th of the billing month
  const d = new Date(billingMonthIso);
  d.setDate(10);
  return d.toISOString().slice(0, 10);
}

function buildInvoiceNumber(buildingPrefix: string, flatNumber: string, ym: string) {
  // INV-{building}-{flat}-{YYYYMM}
  const monthKey = ym.replace("-", "");
  return `INV-${buildingPrefix}-${flatNumber}-${monthKey}`.toUpperCase();
}

export async function generateMonthlyInvoices(params: { month: string }) {
  // month: "YYYY-MM"
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const billing_month = firstOfMonth(params.month);
  const due_date = dueDateFor(billing_month);

  const { data: building } = await supabase
    .from("bms_buildings")
    .select("name, monthly_fee_default")
    .eq("id", profile.building_id)
    .single();
  const buildingPrefix = (building?.name ?? "B").slice(0, 3).replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BLD";
  const defaultFee = Number(building?.monthly_fee_default ?? 3000);

  // Fetch flats — only "active" — for our purposes, non-vacant
  const { data: flats, error: flatsErr } = await supabase
    .from("bms_flats")
    .select("id, flat_number, monthly_fee, ownership_type")
    .eq("building_id", profile.building_id);
  if (flatsErr) throw new Error(flatsErr.message);

  // Existing invoices for this month
  const { data: existing } = await supabase
    .from("bms_invoices")
    .select("flat_id")
    .eq("building_id", profile.building_id)
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
      building_id: profile.building_id,
      flat_id: f.id,
      invoice_number: buildInvoiceNumber(buildingPrefix, f.flat_number, params.month),
      billing_month,
      amount,
      status: "pending",
      due_date,
    });
  }

  let inserted = 0;
  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from("bms_invoices")
      .insert(toInsert)
      .select("id, flat_id, amount");
    if (error) throw new Error(error.message);
    inserted = data?.length ?? 0;

    // Add to flats' outstanding_dues
    for (const row of data ?? []) {
      const { data: flatRow } = await supabase
        .from("bms_flats")
        .select("outstanding_dues")
        .eq("id", row.flat_id)
        .single();
      const newDues = Number(flatRow?.outstanding_dues ?? 0) + Number(row.amount);
      await supabase
        .from("bms_flats")
        .update({ outstanding_dues: newDues })
        .eq("id", row.flat_id);
    }
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "billing.generate_month",
    entity: "invoice",
    meta: { month: params.month, count: inserted },
  });

  revalidatePath("/admin/billing");
  revalidatePath("/admin");
  revalidatePath("/admin/flats");
  return { inserted, skipped: (flats?.length ?? 0) - inserted };
}

export async function waiveInvoice(id: string, reason?: string) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { data: inv } = await supabase
    .from("bms_invoices")
    .select("flat_id, amount, status")
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .single();
  if (!inv) throw new Error("Invoice not found");

  const { error } = await supabase
    .from("bms_invoices")
    .update({ status: "waived", notes: reason ?? null })
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  // reduce outstanding dues for flat
  if (inv.status !== "paid" && inv.status !== "waived") {
    const { data: flatRow } = await supabase
      .from("bms_flats")
      .select("outstanding_dues")
      .eq("id", inv.flat_id)
      .single();
    const newDues = Math.max(0, Number(flatRow?.outstanding_dues ?? 0) - Number(inv.amount));
    await supabase
      .from("bms_flats")
      .update({ outstanding_dues: newDues })
      .eq("id", inv.flat_id);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "invoice.waive",
    entity: "invoice",
    entity_id: id,
    meta: { reason },
  });

  revalidatePath("/admin/billing");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteInvoice(id: string) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { data: inv } = await supabase
    .from("bms_invoices")
    .select("flat_id, amount, status")
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .single();
  if (!inv) throw new Error("Invoice not found");

  // Refuse to delete if there are payments
  const { count } = await supabase
    .from("bms_payments")
    .select("*", { count: "exact", head: true })
    .eq("invoice_id", id);
  if ((count ?? 0) > 0) throw new Error("Cannot delete invoice with payments");

  const { error } = await supabase
    .from("bms_invoices")
    .delete()
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  if (inv.status !== "paid" && inv.status !== "waived") {
    const { data: flatRow } = await supabase
      .from("bms_flats")
      .select("outstanding_dues")
      .eq("id", inv.flat_id)
      .single();
    const newDues = Math.max(0, Number(flatRow?.outstanding_dues ?? 0) - Number(inv.amount));
    await supabase
      .from("bms_flats")
      .update({ outstanding_dues: newDues })
      .eq("id", inv.flat_id);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "invoice.delete",
    entity: "invoice",
    entity_id: id,
  });

  revalidatePath("/admin/billing");
  revalidatePath("/admin");
  return { ok: true };
}
