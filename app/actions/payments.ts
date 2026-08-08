"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { revalidatePath } from "next/cache";
import { PAYMENT_MODE } from "@/types";

export type PaymentInput = {
  flat_id: string;
  invoice_id?: string | null; // null for entry_fee / other / project
  resident_id?: string | null;
  amount: number;
  payment_date?: string;
  /**
   * Societies collect two ways only: cash, or into a bank account. The legacy
   * values are still accepted so older callers / bookmarked payloads keep
   * working — they all fold into `bank` or `cash` below.
   */
  payment_mode?: "cash" | "bank" | "bank_transfer" | "cheque" | "online" | "other";
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
   * `category === 'project'` contributions.
   */
  project_id?: string | null;
  /**
   * How many months beyond the last billed one this payment may bill in
   * advance. 0 (the default) preserves the old behaviour: money that cannot
   * reach an existing invoice is held on account instead of creating months.
   *
   * The server caps this at 24 regardless of what is sent.
   */
  advance_months?: number;
};

/**
 * One allocation of a collection — the amount that settled a single month.
 */
export type PaymentAllocation = {
  invoice_id: string;
  billing_month: string;
  amount: number;
  /** True when this month was billed by the payment itself, paying ahead. */
  created: boolean;
};

type AllocationResult = {
  group_id: string;
  anchor_payment_id: string;
  receipt_no: number | null;
  total: number;
  allocations: PaymentAllocation[];
  created_invoices: string[];
  months_created: number;
  residual_credit: number;
  allocated?: number;
  credit_id: string | null;
};

/**
 * Postgres error codes our RPCs raise deliberately. Their messages are
 * written for the person at the keyboard, so they pass through verbatim.
 * Anything else (a constraint violation, a network fault) is internal and
 * gets a generic message instead of leaking schema details to the UI.
 */
const USER_FACING_PG_CODES = new Set([
  "28000", // not authenticated
  "42501", // not permitted / demo / expired trial
  "22023", // invalid argument
  "23503", // cross-tenant reference
  "55000", // refused: advance already partly consumed
]);

function rpcError(
  error: { message?: string; code?: string } | null,
  fallback: string,
): Error {
  if (error?.code && USER_FACING_PG_CODES.has(error.code) && error.message) {
    return new Error(error.message);
  }
  return new Error(fallback);
}

/**
 * Fold every legacy mode onto the two the DB accepts. Migration
 * 20260805000003 tightened the CHECK to cash|bank|credit_carryforward.
 *   bank_transfer / online / cheque -> bank  (all mean "money hit the bank")
 *   other                           -> cash  (safest fallback)
 */
function toDbPaymentMode(mode: PaymentInput["payment_mode"]): "cash" | "bank" {
  const m = mode || PAYMENT_MODE.CASH;
  if (
    m === PAYMENT_MODE.BANK_TRANSFER ||
    m === PAYMENT_MODE.ONLINE ||
    m === PAYMENT_MODE.CHEQUE ||
    m === PAYMENT_MODE.BANK
  ) {
    return "bank";
  }
  return "cash";
}

/**
 * Record one physical collection.
 *
 * The whole allocation — settling arrears oldest-first, then the selected
 * invoice, then months already billed ahead, then optionally billing further
 * months, then holding any remainder on account — happens inside
 * `bms_record_payment_allocated`. It lives in the database because it spans
 * roughly fifteen writes across three tables, and PostgREST gives each HTTP
 * call its own transaction: done from here, a dropped connection could leave
 * invoices created but unpaid, and the advisory lock that was supposed to
 * serialise two recorders on one flat was released before the first insert
 * ever ran. See supabase/migrations/20260805000006 and
 * docs/advance-payment-plan.md.
 *
 * Roles are checked twice on purpose: here, so the UI fails fast with a
 * familiar error, and again inside the function, which is SECURITY DEFINER
 * and therefore cannot lean on RLS.
 */
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

  const { data, error } = await supabase.rpc("bms_record_payment_allocated", {
    p_building_id: buildingId,
    p_flat_id: input.flat_id,
    p_invoice_id: input.invoice_id ?? null,
    p_resident_id: input.resident_id ?? null,
    p_amount: input.amount,
    p_payment_date: input.payment_date || new Date().toISOString().slice(0, 10),
    p_payment_mode: toDbPaymentMode(input.payment_mode),
    p_reference_no: input.reference_no ?? null,
    p_category: input.category || (input.invoice_id ? "maintenance" : "other"),
    p_notes: input.notes ?? null,
    p_bank_account_id: input.bank_account_id ?? null,
    p_project_id: input.project_id ?? null,
    p_advance_months: Math.max(0, Math.trunc(input.advance_months ?? 0)),
  });

  if (error) throw rpcError(error, "Could not record payment. Please try again.");

  const result = data as AllocationResult;
  const allocations = result.allocations ?? [];

  // What settled the invoice the recorder actually selected, versus what
  // ran past it. Kept for the dialog's "carried forward" toast.
  const onSelected = input.invoice_id
    ? allocations
        .filter((a) => a.invoice_id === input.invoice_id)
        .reduce((s, a) => s + Number(a.amount ?? 0), 0)
    : 0;
  const overflow = Math.max(0, Number(result.total ?? 0) - onSelected);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "payment.create",
    entity: "payment",
    entity_id: result.anchor_payment_id,
    meta: {
      ...input,
      building_id: buildingId,
      group_id: result.group_id,
      receipt_no: result.receipt_no,
      total: result.total,
      allocations,
      months_created: result.months_created,
      created_invoices: result.created_invoices,
      residual_credit: result.residual_credit,
      credit_id: result.credit_id,
    },
  });

  revalidateAfterPaymentChange();

  return {
    // `id` stays the anchor row so existing callers keep linking to
    // /admin/payments/<id>/receipt.
    id: result.anchor_payment_id,
    receipt_no: result.receipt_no,
    group_id: result.group_id,
    amount: Number(result.total ?? 0),
    overflow,
    credit_id: result.credit_id,
    residual_credit: Number(result.residual_credit ?? 0),
    months_created: Number(result.months_created ?? 0),
    allocations,
  };
}

/**
 * Reverse a collection.
 *
 * Deleting any row reverses the whole group — its sibling allocations, the
 * months it billed ahead, and the advance it left on account. A collection is
 * one act; undoing half of it was how outstanding_dues used to drift.
 *
 * Refuses when a later invoice has already consumed part of the advance; the
 * operator is told to reverse that first rather than have this quietly reach
 * forward into a settled month.
 */
export async function deletePayment(id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("bms_delete_payment_group", {
    p_building_id: buildingId,
    p_payment_id: id,
  });

  if (error) throw rpcError(error, "Could not delete payment. Please try again.");

  const result = data as {
    group_id: string | null;
    flat_id: string | null;
    deleted_rows: number;
    total: number;
    /** Months this collection had billed ahead, now removed entirely. */
    deleted_invoices: string[];
    /**
     * Months that existed independently but were being paid for out of this
     * collection's advance. They survive and revert to unpaid — the operator
     * needs telling, because a resident will notice.
     */
    reopened_invoices: string[];
    already_deleted: boolean;
  };

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "payment.delete",
    entity: "payment",
    entity_id: id,
    meta: {
      group_id: result.group_id,
      flat_id: result.flat_id,
      deleted_rows: result.deleted_rows,
      total: result.total,
      deleted_invoices: result.deleted_invoices,
      reopened_invoices: result.reopened_invoices,
      already_deleted: result.already_deleted,
    },
  });

  revalidateAfterPaymentChange();
  return { ok: true, ...result };
}

/**
 * Every surface that shows money for a flat. A collection can now touch
 * several months at once, so the invoice lists move as well as the totals.
 */
function revalidateAfterPaymentChange() {
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin/other-income");
  revalidatePath("/admin");
  revalidatePath("/admin/flats");
  revalidatePath("/admin/reports", "layout");
  revalidatePath("/resident");
  revalidatePath("/resident/dues");
  revalidatePath("/resident/payments");
  revalidatePath("/union/collections");
}
