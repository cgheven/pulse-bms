"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export type PaymentInput = {
  flat_id: string;
  invoice_id?: string | null; // null for entry_fee / other
  resident_id?: string | null;
  amount: number;
  payment_date?: string;
  payment_mode?: "cash" | "bank_transfer" | "cheque" | "online" | "other";
  reference_no?: string | null;
  category?: "maintenance" | "entry_fee" | "fine" | "other";
  notes?: string | null;
};

function makeReceiptNo(buildingPrefix: string) {
  const ts = Date.now().toString().slice(-8);
  return `RCPT-${buildingPrefix}-${ts}`;
}

export async function recordPayment(input: PaymentInput) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  if (!input.amount || input.amount <= 0) throw new Error("Amount must be positive");

  const supabase = await createClient();

  const { data: building } = await supabase
    .from("bms_buildings")
    .select("name")
    .eq("id", profile.building_id)
    .single();
  const buildingPrefix =
    (building?.name ?? "B").slice(0, 3).replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BLD";

  const receipt_no = makeReceiptNo(buildingPrefix);

  // Insert payment
  const insertPayload = {
    building_id: profile.building_id,
    invoice_id: input.invoice_id ?? null,
    flat_id: input.flat_id,
    resident_id: input.resident_id ?? null,
    amount: input.amount,
    payment_date: input.payment_date || new Date().toISOString().slice(0, 10),
    payment_mode: input.payment_mode || "cash",
    reference_no: input.reference_no?.trim() || null,
    category: input.category || (input.invoice_id ? "maintenance" : "other"),
    receipt_no,
    notes: input.notes?.trim() || null,
    recorded_by: user.id,
  };

  const { data: payment, error: payErr } = await supabase
    .from("bms_payments")
    .insert(insertPayload)
    .select()
    .single();
  if (payErr) throw new Error(payErr.message);

  // If linked to invoice, update invoice status
  if (input.invoice_id) {
    const { data: inv } = await supabase
      .from("bms_invoices")
      .select("amount, status")
      .eq("id", input.invoice_id)
      .single();
    if (inv) {
      const { data: paidRows } = await supabase
        .from("bms_payments")
        .select("amount")
        .eq("invoice_id", input.invoice_id);
      const paidTotal = (paidRows ?? []).reduce(
        (sum, r) => sum + Number(r.amount ?? 0),
        0,
      );
      let newStatus: string = inv.status ?? "pending";
      if (paidTotal >= Number(inv.amount)) newStatus = "paid";
      else if (paidTotal > 0) newStatus = "partial";
      else newStatus = "pending";
      await supabase
        .from("bms_invoices")
        .update({ status: newStatus })
        .eq("id", input.invoice_id);
    }
  }

  // Update flat's outstanding_dues if this payment relates to maintenance
  if (input.category !== "entry_fee" && input.category !== "fine" && input.category !== "other") {
    const { data: flatRow } = await supabase
      .from("bms_flats")
      .select("outstanding_dues")
      .eq("id", input.flat_id)
      .single();
    const newDues = Math.max(0, Number(flatRow?.outstanding_dues ?? 0) - Number(input.amount));
    await supabase
      .from("bms_flats")
      .update({ outstanding_dues: newDues })
      .eq("id", input.flat_id);
  }

  // For entry_fee, bump resident.entry_fee_paid
  if (input.category === "entry_fee" && input.resident_id) {
    const { data: r } = await supabase
      .from("bms_residents")
      .select("entry_fee_paid")
      .eq("id", input.resident_id)
      .single();
    await supabase
      .from("bms_residents")
      .update({ entry_fee_paid: Number(r?.entry_fee_paid ?? 0) + Number(input.amount) })
      .eq("id", input.resident_id);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "payment.create",
    entity: "payment",
    entity_id: payment.id,
    meta: insertPayload,
  });

  revalidatePath("/admin/payments");
  revalidatePath("/admin/billing");
  revalidatePath("/admin");
  revalidatePath("/admin/flats");
  revalidatePath("/admin/finance");
  return payment;
}

export async function deletePayment(id: string) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { data: pay } = await supabase
    .from("bms_payments")
    .select("invoice_id, flat_id, amount, category, resident_id")
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .single();
  if (!pay) throw new Error("Payment not found");

  const { error } = await supabase
    .from("bms_payments")
    .delete()
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  // Recompute invoice status
  if (pay.invoice_id) {
    const { data: inv } = await supabase
      .from("bms_invoices")
      .select("amount")
      .eq("id", pay.invoice_id)
      .single();
    const { data: paidRows } = await supabase
      .from("bms_payments")
      .select("amount")
      .eq("invoice_id", pay.invoice_id);
    const paidTotal = (paidRows ?? []).reduce(
      (sum, r) => sum + Number(r.amount ?? 0),
      0,
    );
    let newStatus: string = "pending";
    if (paidTotal >= Number(inv?.amount ?? 0) && Number(inv?.amount ?? 0) > 0) newStatus = "paid";
    else if (paidTotal > 0) newStatus = "partial";
    await supabase
      .from("bms_invoices")
      .update({ status: newStatus })
      .eq("id", pay.invoice_id);
  }

  // Restore outstanding dues
  if (pay.category !== "entry_fee" && pay.category !== "fine" && pay.category !== "other") {
    const { data: flatRow } = await supabase
      .from("bms_flats")
      .select("outstanding_dues")
      .eq("id", pay.flat_id)
      .single();
    await supabase
      .from("bms_flats")
      .update({ outstanding_dues: Number(flatRow?.outstanding_dues ?? 0) + Number(pay.amount) })
      .eq("id", pay.flat_id);
  }

  if (pay.category === "entry_fee" && pay.resident_id) {
    const { data: r } = await supabase
      .from("bms_residents")
      .select("entry_fee_paid")
      .eq("id", pay.resident_id)
      .single();
    await supabase
      .from("bms_residents")
      .update({
        entry_fee_paid: Math.max(0, Number(r?.entry_fee_paid ?? 0) - Number(pay.amount)),
      })
      .eq("id", pay.resident_id);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "payment.delete",
    entity: "payment",
    entity_id: id,
  });

  revalidatePath("/admin/payments");
  revalidatePath("/admin/billing");
  revalidatePath("/admin/finance");
  revalidatePath("/admin");
  return { ok: true };
}
