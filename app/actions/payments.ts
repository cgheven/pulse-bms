"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAYMENT_MODE } from "@/types";
import { unionPositionLabel, UNION_POSITION_PRIORITY } from "@/lib/union-positions";
import { formatReceiptNo } from "@/lib/utils";

export type PaymentInput = {
  flat_id: string;
  invoice_id?: string | null; // null for entry_fee / other
  resident_id?: string | null;
  amount: number;
  payment_date?: string;
  payment_mode?: "cash" | "bank_transfer" | "cheque" | "online" | "other";
  reference_no?: string | null;
  category?: "maintenance" | "entry_fee" | "fine" | "other" | "project";
  notes?: string | null;
  /**
   * Which bank account / cash drawer the money was deposited into.
   * Nullable; defaults to the per-building Cash account at the form layer.
   */
  bank_account_id?: string | null;
  /**
   * Project Fund row this payment belongs to. Only set for
   * `category === 'project'` contributions. Validated cross-tenant
   * (must belong to caller's building) and stamped atomically on the
   * INSERT — no follow-up UPDATE so we can't leak orphan rows if the
   * stamp fails midway.
   */
  project_id?: string | null;
};

// Receipt numbers are now allocated by the `bms_payments_receipt_no_trg`
// BEFORE INSERT trigger as per-building monotonic integers (see migration
// 20260523020000_bms_payments_receipt_no.sql). The TS layer no longer
// generates `receipt_no` — we simply omit it from the insert payload and
// the trigger fills `(building_id, max(receipt_no)+1)` under a row lock on
// bms_buildings to serialise concurrent inserts. The old string format
// ("RCPT-BLD-12345678") survives on every legacy row as `legacy_receipt_no`
// for audit traceability.

/**
 * Sum all payment chunks against an invoice. Used to decide invoice status
 * (paid / partial / pending) and to compute remaining capacity before
 * spilling overflow to a future invoice or a flat-level credit.
 */
async function sumPaymentsForInvoice(
  supabase: SupabaseClient,
  invoice_id: string,
  building_id: string,
): Promise<number> {
  const { data } = await supabase
    .from("bms_payments")
    .select("amount")
    .eq("invoice_id", invoice_id)
    .eq("building_id", building_id);
  return (data ?? []).reduce(
    (sum, r) => sum + Number((r as { amount: number }).amount ?? 0),
    0,
  );
}

/**
 * Recompute invoice status from chunk totals. We KEEP the DB enum
 * `pending|partial|paid` for filtering and reporting; the UI never shows
 * "partial" or "pending" — see lib/billing-status.ts for rendering rules.
 */
async function refreshInvoiceStatus(
  supabase: SupabaseClient,
  invoice_id: string,
  building_id: string,
): Promise<{ amount: number; paidTotal: number; status: string }> {
  const { data: inv } = await supabase
    .from("bms_invoices")
    .select("amount")
    .eq("id", invoice_id)
    .eq("building_id", building_id)
    .single();
  const amount = Number((inv as { amount: number } | null)?.amount ?? 0);
  const paidTotal = await sumPaymentsForInvoice(supabase, invoice_id, building_id);
  let newStatus: "paid" | "partial" | "pending" = "pending";
  if (paidTotal >= amount && amount > 0) newStatus = "paid";
  else if (paidTotal > 0) newStatus = "partial";
  await supabase
    .from("bms_invoices")
    .update({ status: newStatus })
    .eq("id", invoice_id)
    .eq("building_id", building_id);
  return { amount, paidTotal, status: newStatus };
}

export async function recordPayment(input: PaymentInput) {
  await requireNotDemo();
  // Union role can also record payments — committee officers
  // (Treasurer / Secretary / etc.) collect cash door-to-door alongside the
  // President (admin role). Super_admin still allowed for ops support.
  const { profile, user } = await requireRole([
    "admin",
    "super_admin",
    "union",
  ]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  if (!input.amount || input.amount <= 0) throw new Error("Amount must be positive");

  const supabase = await createClient();

  // ── Cross-tenant guard: bank_account_id must belong to caller's building ─
  // RLS blocks READING foreign rows, but the FK on bms_payments.bank_account_id
  // happily accepts ANY uuid on INSERT. Without this check a malicious admin
  // could attribute their building's cash to another building's account and
  // silently mis-attribute the Cash Position / Bank reports.
  if (input.bank_account_id) {
    const { data: bankCheck } = await supabase
      .from("bms_bank_accounts")
      .select("id")
      .eq("id", input.bank_account_id)
      .eq("building_id", buildingId)
      .maybeSingle();
    if (!bankCheck) throw new Error("Invalid bank account");
  }

  // ── Cross-tenant guard: project_id must belong to caller's building ─
  // Same defence-in-depth as the bank check above. Stamping happens
  // atomically on the INSERT below — no follow-up UPDATE — so we MUST
  // validate the fk up-front; the DB's RLS won't backstop a cross-tenant
  // INSERT (RLS gates reads; FK gates referential integrity but not
  // tenancy). Empty/null is fine — only `category === 'project'` rows
  // carry a project_id; everyone else passes null.
  if (input.project_id) {
    const { data: projCheck } = await supabase
      .from("bms_projects")
      .select("id")
      .eq("id", input.project_id)
      .eq("building_id", buildingId)
      .maybeSingle();
    if (!projCheck) throw new Error("Invalid project");
  }

  // ── Resolve receiver snapshot ─────────────────────────────────────
  // We snapshot WHO is recording this payment so the receipt + audit log
  // can attribute the cash to a specific committee officer. Super_admin
  // is treated as a system actor → null receiver (they don't physically
  // collect cash in the field). For admin / union we look up their
  // active committee position and denormalize the label so it survives
  // committee changes and profile deletion.
  let received_by_profile_id: string | null = null;
  let received_by_name: string | null = null;
  let received_by_position: string | null = null;
  if (profile.role !== "super_admin") {
    received_by_profile_id = profile.id;
    received_by_name = profile.full_name ?? null;
    // A profile can hold MULTIPLE active union_members rows (e.g. demo
    // data where one person is both VP and Treasurer). Fetch all of them
    // and pick the highest-authority slot via UNION_POSITION_PRIORITY so
    // the receiver snapshot is deterministic across payments — no more
    // "stamped Treasurer here, Member there" audit-noise.
    const { data: memberRows } = await supabase
      .from("bms_union_members")
      .select("position")
      .eq("profile_id", profile.id)
      .eq("building_id", buildingId)
      .eq("is_active", true);
    const positions = (memberRows ?? [])
      .map((r) => (r as { position: string | null }).position)
      .filter((p): p is string => Boolean(p));
    const rawPosition =
      UNION_POSITION_PRIORITY.find((p) => positions.includes(p)) ??
      positions[0] ??
      null;
    if (rawPosition) {
      received_by_position = unionPositionLabel(rawPosition);
    } else if (profile.role === "admin") {
      // Admin role = building President by convention, but they may not
      // yet be seeded into bms_union_members. Default to "President" so
      // the receiver column on the receipt uses the actual title rather
      // than system-jargon residents won't recognise.
      received_by_position = "President";
    } else {
      // Union role without an active members row — leave null. The
      // collections page renders just the name in that case.
      received_by_position = null;
    }
  }

  // ── Cross-tenant guard: flat_id must belong to caller's building ──
  // RLS gates reads but not FK references on INSERT. A cross-tenant flat_id
  // would create a payment row with mismatched building_id / flat_id.
  const { data: flatCheck } = await supabase
    .from("bms_flats")
    .select("id")
    .eq("id", input.flat_id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!flatCheck) throw new Error("Invalid flat");

  // ── Concurrency guard ─────────────────────────────────────────────
  // Serialise concurrent recordPayment calls against the SAME FLAT via a
  // Postgres advisory lock. The lock is xact-scoped: PostgREST runs each
  // RPC + subsequent statement batch inside one transaction, so the lock
  // is held until this action returns.
  //
  // We key on flat_id (not invoice_id) because a chowkidar batch-recording
  // several cash payments for the same flat across DIFFERENT invoices (e.g.
  // March + April) would otherwise race on bms_flats.outstanding_dues: both
  // requests read the same value, both subtract, last-writer-wins, dues
  // drift by one chunk amount per collision. Per-flat locking is the
  // correct granularity — and for a ~30-flat building it has no meaningful
  // contention cost.
  if (input.invoice_id) {
    const { error: lockErr } = await supabase.rpc(
      "bms_record_payment_with_lock",
      {
        p_invoice_id: input.invoice_id,
        p_building_id: buildingId,
        p_flat_id: input.flat_id,
      },
    );
    if (lockErr) throw new Error("Could not record payment. Please try again.");
  }

  // Map TS "bank_transfer" → DB "bank" (legacy DB enum). The check constraint
  // in the migration knows only `cash|bank|online|cheque|credit_carryforward`.
  const dbPaymentMode = (() => {
    const m = input.payment_mode || PAYMENT_MODE.CASH;
    if (m === PAYMENT_MODE.BANK_TRANSFER) return PAYMENT_MODE.BANK;
    if (m === PAYMENT_MODE.OTHER) return PAYMENT_MODE.ONLINE; // best-effort fallback
    return m;
  })();

  const insertPayload = {
    building_id: buildingId,
    invoice_id: input.invoice_id ?? null,
    flat_id: input.flat_id,
    resident_id: input.resident_id ?? null,
    amount: input.amount, // raw chunk amount; we may CAP this below
    payment_date: input.payment_date || new Date().toISOString().slice(0, 10),
    payment_mode: dbPaymentMode,
    reference_no: input.reference_no?.trim() || null,
    category: input.category || (input.invoice_id ? "maintenance" : "other"),
    // receipt_no is auto-allocated by bms_payments_receipt_no_trg.
    notes: input.notes?.trim() || null,
    recorded_by: user.id,
    received_by_profile_id,
    received_by_name,
    received_by_position,
    bank_account_id: input.bank_account_id ?? null,
    // Stamped atomically with row creation so the Projects report can
    // never see an orphan `category='project'` row missing its project_id.
    // Validated cross-tenant above.
    project_id: input.project_id ?? null,
  };

  const { data: payment, error: payErr } = await supabase
    .from("bms_payments")
    .insert(insertPayload)
    .select()
    .single();
  if (payErr) throw new Error("Could not record payment. Please try again.");

  let overflow = 0;
  let cappedAmount = Number(input.amount);

  // ── Overpayment handling ───────────────────────────────────────────
  // If chunk amount + prior payments exceed invoice.amount, cap THIS row
  // at the remaining capacity and route the surplus elsewhere. The cap
  // preserves a clean receipt for the chunk while the surplus is recorded
  // as either a sibling payment row on a later invoice or a credit row.
  if (input.invoice_id) {
    const { data: inv } = await supabase
      .from("bms_invoices")
      .select("amount")
      .eq("id", input.invoice_id)
      .eq("building_id", buildingId)
      .single();
    if (inv) {
      const invoiceAmount = Number(inv.amount);
      const paidTotal = await sumPaymentsForInvoice(
        supabase,
        input.invoice_id,
        buildingId,
      );
      if (paidTotal > invoiceAmount) {
        overflow = paidTotal - invoiceAmount;
        cappedAmount = Math.max(0, Number(input.amount) - overflow);
        // Cap this row's amount so the receipt PDF shows the portion that
        // actually settled this invoice. The overflow becomes its own row
        // (against a later invoice OR a credit row) — never silently dropped.
        await supabase
          .from("bms_payments")
          .update({ amount: cappedAmount })
          .eq("id", payment.id)
          .eq("building_id", buildingId);
      }
    }
    // Status update (always re-derive from chunk sums — single source of truth)
    await refreshInvoiceStatus(supabase, input.invoice_id, buildingId);
  }

  // ── Route the surplus ─────────────────────────────────────────────
  let creditId: string | null = null;
  const spilloverPaymentIds: string[] = [];

  if (overflow > 0 && input.invoice_id) {
    // 1. Find the current invoice's billing_month so we only look FORWARD
    const { data: thisInv } = await supabase
      .from("bms_invoices")
      .select("billing_month")
      .eq("id", input.invoice_id)
      .eq("building_id", buildingId)
      .single();

    let remainingOverflow = overflow;
    if (thisInv?.billing_month) {
      // 2. Walk forward through open (non-paid, non-waived) invoices for the
      //    same flat in chronological order, spilling overflow into each
      //    until it's consumed.
      // TODO(perf): add composite index on
      //   bms_invoices(building_id, flat_id, billing_month, status)
      // to keep this lookup snappy once each flat has years of history.
      const { data: futureInvoices } = await supabase
        .from("bms_invoices")
        .select("id, amount, billing_month, invoice_number")
        .eq("building_id", buildingId)
        .eq("flat_id", input.flat_id)
        .gt("billing_month", thisInv.billing_month)
        .in("status", ["pending", "partial", "overdue"])
        .order("billing_month", { ascending: true });

      for (const fi of futureInvoices ?? []) {
        if (remainingOverflow <= 0) break;
        const fiPaid = await sumPaymentsForInvoice(
          supabase,
          fi.id,
          buildingId,
        );
        const capacity = Math.max(0, Number(fi.amount) - fiPaid);
        if (capacity <= 0) continue;
        const apply = Math.min(capacity, remainingOverflow);

        // Spillover only runs when the parent row has an invoice_id, which
        // project contributions never have (they pass invoice_id: null). So
        // we deliberately do NOT propagate project_id here — project payments
        // are one-shot, never carry forward to a "future project". This
        // branch is unreachable for category='project' but the omission is
        // intentional belt-and-braces.
        // Format parent receipt_no as 6-digit string for the back-link
        // (matches the paper-book convention shown on the printed receipt).
        // `formatReceiptNo` returns "" for null — we gate the note text below
        // so we don't write "Carry-forward from receipt " with a dangling space.
        const parentReceiptStr = formatReceiptNo(payment.receipt_no);
        const spillRow = {
          building_id: buildingId,
          invoice_id: fi.id,
          flat_id: input.flat_id,
          resident_id: input.resident_id ?? null,
          amount: apply,
          payment_date:
            input.payment_date || new Date().toISOString().slice(0, 10),
          payment_mode: PAYMENT_MODE.CREDIT_CARRYFORWARD,
          // back-link to parent chunk; null when the parent receipt_no
          // hasn't been allocated yet (should never happen because the
          // trigger always runs, but the type allows it)
          reference_no: parentReceiptStr || null,
          category: "maintenance" as const,
          // receipt_no auto-allocated by trigger
          notes: parentReceiptStr
            ? `Carry-forward from receipt ${parentReceiptStr}`
            : "Carry-forward from earlier payment",
          recorded_by: user.id,
          // Spillover rows inherit the same receiver snapshot from the
          // parent chunk so "who collected what" stays consistent across
          // every row generated by a single cash collection.
          received_by_profile_id,
          received_by_name,
          received_by_position,
          bank_account_id: input.bank_account_id ?? null,
        };
        const { data: spill, error: spillErr } = await supabase
          .from("bms_payments")
          .insert(spillRow)
          .select("id")
          .single();
        if (spillErr) throw new Error("Payment carry-forward failed. Please try again.");
        spilloverPaymentIds.push(spill.id);
        remainingOverflow -= apply;

        await refreshInvoiceStatus(supabase, fi.id, buildingId);
      }
    }

    // 3. Anything still left becomes a flat-level credit row to auto-apply
    //    on the next invoice generation.
    if (remainingOverflow > 0) {
      const parentReceiptStr = formatReceiptNo(payment.receipt_no);
      const { data: credit, error: creditErr } = await supabase
        .from("bms_flat_credits")
        .insert({
          building_id: buildingId,
          flat_id: input.flat_id,
          amount: remainingOverflow,
          source_payment_id: payment.id,
          notes: parentReceiptStr
            ? `Surplus from receipt ${parentReceiptStr}`
            : "Surplus from earlier payment",
          created_by: user.id,
        })
        .select("id")
        .single();
      if (creditErr) throw new Error("Could not record surplus credit. Please try again.");
      creditId = credit.id;
    }
  }

  // ── outstanding_dues bookkeeping ──────────────────────────────────
  // Reduce by the full chunk amount (NOT the capped amount). The surplus
  // is now tracked either in a future invoice's payment row OR in a credit
  // row — both are still "money in", so dues must drop by the full chunk.
  //
  // Skip entirely when invoice_id is null: maintenance payments must ALWAYS
  // be tied to an invoice. A null invoice means this is non-maintenance
  // (entry_fee / fine / other) and shouldn't touch dues.
  if (
    input.invoice_id &&
    input.category !== "entry_fee" &&
    input.category !== "fine" &&
    input.category !== "other"
  ) {
    const { data: flatRow } = await supabase
      .from("bms_flats")
      .select("outstanding_dues")
      .eq("id", input.flat_id)
      .eq("building_id", buildingId)
      .single();
    // No more Math.max clamp — overpayments must show as negative dues
    // (which UI now interprets as "Cleared + credit"). Negative outstanding
    // is intentional; the credit table is the audit trail.
    const newDues = Number(flatRow?.outstanding_dues ?? 0) - Number(input.amount);
    await supabase
      .from("bms_flats")
      .update({ outstanding_dues: newDues })
      .eq("id", input.flat_id)
      .eq("building_id", buildingId);
  }

  // entry_fee accounting — building_id scope prevents cross-tenant corruption (SEC-005).
  if (input.category === "entry_fee" && input.resident_id) {
    const { data: r } = await supabase
      .from("bms_residents")
      .select("entry_fee_paid")
      .eq("id", input.resident_id)
      .eq("building_id", buildingId)
      .single();
    await supabase
      .from("bms_residents")
      .update({
        entry_fee_paid:
          Number(r?.entry_fee_paid ?? 0) + Number(input.amount),
      })
      .eq("id", input.resident_id)
      .eq("building_id", buildingId);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "payment.create",
    entity: "payment",
    entity_id: payment.id,
    meta: {
      ...insertPayload,
      capped_amount: cappedAmount,
      overflow,
      spillover_payment_ids: spilloverPaymentIds,
      credit_id: creditId,
    },
  });

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin/other-income");
  revalidatePath("/admin");
  revalidatePath("/admin/flats");
  revalidatePath("/admin/reports", "layout");
  revalidatePath("/resident");
  revalidatePath("/resident/dues");
  revalidatePath("/resident/payments");
  revalidatePath("/union/collections");

  return {
    ...payment,
    amount: cappedAmount,
    overflow,
    credit_id: creditId,
    spillover_payment_ids: spilloverPaymentIds,
  };
}

export async function deletePayment(id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const { data: pay } = await supabase
    .from("bms_payments")
    .select("invoice_id, flat_id, amount, category, resident_id")
    .eq("id", id)
    .eq("building_id", buildingId)
    .single();
  if (!pay) throw new Error("Payment not found");

  const { error } = await supabase
    .from("bms_payments")
    .delete()
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error("Could not delete payment. Please try again.");

  if (pay.invoice_id) {
    await refreshInvoiceStatus(supabase, pay.invoice_id, buildingId);
  }

  if (
    pay.invoice_id &&
    pay.category !== "entry_fee" &&
    pay.category !== "fine" &&
    pay.category !== "other"
  ) {
    const { data: flatRow } = await supabase
      .from("bms_flats")
      .select("outstanding_dues")
      .eq("id", pay.flat_id)
      .eq("building_id", buildingId)
      .single();
    await supabase
      .from("bms_flats")
      .update({ outstanding_dues: Number(flatRow?.outstanding_dues ?? 0) + Number(pay.amount) })
      .eq("id", pay.flat_id)
      .eq("building_id", buildingId);
  }

  if (pay.category === "entry_fee" && pay.resident_id) {
    const { data: r } = await supabase
      .from("bms_residents")
      .select("entry_fee_paid")
      .eq("id", pay.resident_id)
      .eq("building_id", buildingId)
      .single();
    await supabase
      .from("bms_residents")
      .update({
        entry_fee_paid: Math.max(0, Number(r?.entry_fee_paid ?? 0) - Number(pay.amount)),
      })
      .eq("id", pay.resident_id)
      .eq("building_id", buildingId);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "payment.delete",
    entity: "payment",
    entity_id: id,
  });

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin/other-income");
  revalidatePath("/admin");
  revalidatePath("/admin/flats");
  revalidatePath("/admin/reports", "layout");
  revalidatePath("/resident");
  revalidatePath("/resident/dues");
  revalidatePath("/resident/payments");
  revalidatePath("/union/collections");
  return { ok: true };
}
