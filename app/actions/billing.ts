"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { PAYMENT_MODE } from "@/types";

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
  await requireNotDemo();
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
  let creditsApplied = 0;
  let creditsAmount = 0;
  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from("bms_invoices")
      .insert(toInsert)
      .select("id, flat_id, amount, billing_month, invoice_number");
    if (error) throw new Error(error.message);
    inserted = data?.length ?? 0;

    // Add to flats' outstanding_dues + auto-apply any open carry-forward credit.
    // Pakistani resident pays Rs. 8k against a Rs. 5k bill → Rs. 3k credit was
    // parked in bms_flat_credits. Next time we generate an invoice for that
    // flat, we burn the credit immediately: it shows up as a real payment row
    // (mode = 'credit_carryforward') with a back-link to the source receipt
    // and the invoice flips to paid/partial as appropriate.
    for (const row of data ?? []) {
      const { data: flatRow } = await supabase
        .from("bms_flats")
        .select("outstanding_dues")
        .eq("id", row.flat_id)
        .eq("building_id", profile.building_id)
        .single();
      const newDues = Number(flatRow?.outstanding_dues ?? 0) + Number(row.amount);
      await supabase
        .from("bms_flats")
        .update({ outstanding_dues: newDues })
        .eq("id", row.flat_id)
        .eq("building_id", profile.building_id);

      // Pull open credits for this flat, oldest first (FIFO). created_at
      // is selected so we can preserve it on a split-remainder row — that
      // keeps the queue stable even when one credit is partially consumed.
      const { data: openCredits } = await supabase
        .from("bms_flat_credits")
        .select("id, amount, source_payment_id, created_at")
        .eq("building_id", profile.building_id)
        .eq("flat_id", row.flat_id)
        .is("applied_invoice_id", null)
        .order("created_at", { ascending: true });

      if (!openCredits || openCredits.length === 0) continue;

      let remaining = Number(row.amount);
      for (const c of openCredits) {
        if (remaining <= 0) break;
        const creditAmt = Number(c.amount);
        const apply = Math.min(creditAmt, remaining);

        // Record the credit as a real payment chunk so it appears in the
        // payment history and on receipts. receipt_no is auto-allocated by
        // the bms_payments_receipt_no_trg trigger.
        const { error: payErr } = await supabase.from("bms_payments").insert({
          building_id: profile.building_id,
          invoice_id: row.id,
          flat_id: row.flat_id,
          amount: apply,
          payment_date: new Date().toISOString().slice(0, 10),
          payment_mode: PAYMENT_MODE.CREDIT_CARRYFORWARD,
          reference_no: null,
          category: "maintenance",
          notes: "Credit applied from previous overpayment",
          recorded_by: user.id,
        });
        if (payErr) throw new Error(payErr.message);

        // Mark the credit consumed. If the credit was bigger than what we
        // needed, split it: close the original by applying the full amount
        // (so the audit trail is "this much went to this invoice") and open
        // a new row for the remainder. The remainder row INHERITS the
        // original credit's created_at so subsequent FIFO ordering is stable.
        if (creditAmt > apply) {
          await supabase
            .from("bms_flat_credits")
            .update({ applied_invoice_id: row.id, amount: apply })
            .eq("id", c.id)
            .eq("building_id", profile.building_id);
          await supabase.from("bms_flat_credits").insert({
            building_id: profile.building_id,
            flat_id: row.flat_id,
            amount: creditAmt - apply,
            source_payment_id: c.source_payment_id,
            notes: "Carry-forward remainder",
            created_by: user.id,
            created_at: c.created_at,
          });
        } else {
          await supabase
            .from("bms_flat_credits")
            .update({ applied_invoice_id: row.id })
            .eq("id", c.id)
            .eq("building_id", profile.building_id);
        }

        remaining -= apply;
        creditsAmount += apply;
        creditsApplied += 1;

        // NOTE: We intentionally DO NOT decrement outstanding_dues here.
        // The dues math has already been done for this overpayment cycle:
        //  - When the resident originally over-paid, recordPayment reduced
        //    outstanding_dues by the FULL chunk (incl. the surplus parked
        //    in bms_flat_credits).
        //  - The new invoice we just generated INCREASED outstanding_dues
        //    by the invoice amount.
        //  - Subtracting again here would double-count the credit and push
        //    outstanding_dues into a permanently negative state.
        // Net effect: the original overpayment already accounted for this
        // bill being paid; the credit ledger is the audit trail.
      }

      // Re-derive invoice status from payments now that credits flowed in.
      const { data: paidRows } = await supabase
        .from("bms_payments")
        .select("amount")
        .eq("building_id", profile.building_id)
        .eq("invoice_id", row.id);
      const paidTotal = (paidRows ?? []).reduce(
        (s, r) => s + Number(r.amount ?? 0),
        0,
      );
      let newStatus: "paid" | "partial" | "pending" = "pending";
      if (paidTotal >= Number(row.amount)) newStatus = "paid";
      else if (paidTotal > 0) newStatus = "partial";
      await supabase
        .from("bms_invoices")
        .update({ status: newStatus })
        .eq("id", row.id)
        .eq("building_id", profile.building_id);
    }
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
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
    skipped: (flats?.length ?? 0) - inserted,
    creditsApplied,
    creditsAmount,
  };
}

export async function waiveInvoice(id: string, reason?: string) {
  await requireNotDemo();
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

  // reduce outstanding dues for flat (scope by building_id — defence-in-depth)
  if (inv.status !== "paid" && inv.status !== "waived") {
    const { data: flatRow } = await supabase
      .from("bms_flats")
      .select("outstanding_dues")
      .eq("id", inv.flat_id)
      .eq("building_id", profile.building_id)
      .single();
    const newDues = Math.max(0, Number(flatRow?.outstanding_dues ?? 0) - Number(inv.amount));
    await supabase
      .from("bms_flats")
      .update({ outstanding_dues: newDues })
      .eq("id", inv.flat_id)
      .eq("building_id", profile.building_id);
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

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteInvoice(id: string) {
  await requireNotDemo();
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

  // Refuse to delete if there are payments. Scope by building_id as
  // defence-in-depth — RLS already filters, but pinning the building keeps
  // the count safe even if a future RLS regression widens visibility.
  const { count } = await supabase
    .from("bms_payments")
    .select("*", { count: "exact", head: true })
    .eq("invoice_id", id)
    .eq("building_id", profile.building_id);
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
      .eq("building_id", profile.building_id)
      .single();
    const newDues = Math.max(0, Number(flatRow?.outstanding_dues ?? 0) - Number(inv.amount));
    await supabase
      .from("bms_flats")
      .update({ outstanding_dues: newDues })
      .eq("id", inv.flat_id)
      .eq("building_id", profile.building_id);
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

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
  return { ok: true };
}
