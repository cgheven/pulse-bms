import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import type { ReceiptCardProps } from "@/components/payments/receipt-card";
import type { Role } from "@/types";

/**
 * Load + assemble the data needed to render a printable receipt for a
 * single payment row. Returns null when the payment is missing or fails
 * the multi-tenant guard.
 *
 * All three role-scoped receipt routes (admin / union / resident) share
 * this loader. The route is responsible for any role-specific extras
 * (resident self-only gate, audit logging, etc.) — this function does
 * the cross-tenant scoping (`.eq("building_id", buildingId)` on every
 * read) but nothing more.
 */
export async function loadReceiptData(
  paymentId: string,
  buildingId: string,
): Promise<{ data: ReceiptCardProps; payment_row: { id: string; resident_id: string | null; flat_id: string | null } } | null> {
  const supabase = await createClient();

  // ── 1. Payment row (multi-tenant guarded) ─────────────────────
  // `legacy_receipt_no` is the pre-migration text receipt string (e.g.
  // "RCPT-DEMO-PROJ-018"). We surface it on admin + union receipts so
  // staff cross-referencing a paper book can still locate the row.
  const { data: payment } = await supabase
    .from("bms_payments")
    .select(
      "id, building_id, invoice_id, flat_id, resident_id, amount, payment_date, payment_mode, reference_no, receipt_no, legacy_receipt_no, category, received_by_name, received_by_position",
    )
    .eq("id", paymentId)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!payment || payment.receipt_no == null) return null;

  // ── 2. Building (header block) ────────────────────────────────
  const { data: building } = await supabase
    .from("bms_buildings")
    .select("name, address, city, public_whatsapp")
    .eq("id", buildingId)
    .single();

  // ── 3. Flat (apartment number) ────────────────────────────────
  let flatNumber = "—";
  if (payment.flat_id) {
    const { data: flat } = await supabase
      .from("bms_flats")
      .select("flat_number")
      .eq("id", payment.flat_id)
      .eq("building_id", buildingId)
      .maybeSingle();
    if (flat) flatNumber = flat.flat_number;
  }

  // ── 4. Resident (received-from line) ──────────────────────────
  // Prefer the explicit resident_id snapshot on the payment row. Fall
  // back to the primary resident on the flat for legacy rows where the
  // chowkidar didn't pick a person.
  let residentName = "—";
  if (payment.resident_id) {
    const { data: res } = await supabase
      .from("bms_residents")
      .select("full_name")
      .eq("id", payment.resident_id)
      .eq("building_id", buildingId)
      .maybeSingle();
    if (res?.full_name) residentName = res.full_name;
  } else if (payment.flat_id) {
    const { data: res } = await supabase
      .from("bms_residents")
      .select("full_name")
      .eq("flat_id", payment.flat_id)
      .eq("building_id", buildingId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (res?.full_name) residentName = res.full_name;
  }

  // ── 5. Invoice context (period label + purpose) ───────────────
  let invoice: ReceiptCardProps["invoice"] = null;
  if (payment.invoice_id) {
    const { data: inv } = await supabase
      .from("bms_invoices")
      .select("billing_month")
      .eq("id", payment.invoice_id)
      .eq("building_id", buildingId)
      .maybeSingle();
    if (inv?.billing_month) {
      const periodLabel = new Date(inv.billing_month).toLocaleDateString("en-PK", {
        month: "long",
        year: "numeric",
      });
      invoice = {
        period_label: periodLabel,
        purpose: purposeLabel(payment.category),
      };
    }
  } else {
    invoice = {
      period_label: payment.payment_date
        ? new Date(payment.payment_date).toLocaleDateString("en-PK", {
            month: "long",
            year: "numeric",
          })
        : "—",
      purpose: purposeLabel(payment.category),
    };
  }

  const data: ReceiptCardProps = {
    building: {
      name: building?.name ?? "Building",
      address: building?.address ?? null,
      city: building?.city ?? null,
      // bms_buildings has no dedicated phone column yet — use the
      // public WhatsApp number as the closest substitute for the
      // "Telephone" line on the paper receipt.
      phone: building?.public_whatsapp ?? null,
      registration_no: null,
    },
    payment: {
      receipt_no: payment.receipt_no,
      legacy_receipt_no: (payment as { legacy_receipt_no?: string | null }).legacy_receipt_no ?? null,
      payment_date: payment.payment_date,
      amount: Number(payment.amount ?? 0),
      method: payment.payment_mode ?? "cash",
      reference: payment.reference_no ?? null,
      received_by_name: payment.received_by_name ?? null,
      received_by_position: payment.received_by_position ?? null,
    },
    flat: { flat_number: flatNumber },
    resident: { name: residentName },
    invoice,
  };

  return {
    data,
    payment_row: {
      id: payment.id,
      resident_id: payment.resident_id,
      flat_id: payment.flat_id,
    },
  };
}

/**
 * Audit-log a `receipt.view` event.
 *
 * Fires on every server render of the receipt page. Refresh = new row,
 * which is the right behaviour for an immutable audit trail (and lets
 * us answer "who viewed this receipt and when" with full fidelity).
 *
 * Note: an earlier version of this helper used a `cookies().set()`
 * call to debounce duplicate writes within 60s, but Next.js 15
 * forbids cookie mutation outside Server Actions / Route Handlers,
 * which crashes the page render. If duplicate-noise becomes a real
 * problem we can move the audit write into a Server Action triggered
 * from a tiny `<ReceiptViewTracker>` client component mounted on each
 * route — that pattern is allowed to mutate cookies.
 *
 * Shared by all 3 role-scoped routes (admin / union / resident).
 */
export async function maybeLogReceiptView(opts: {
  payment_id: string;
  user_id: string;
  user_email: string | null | undefined;
  role: Role;
  building_id: string;
}): Promise<void> {
  await writeAuditLog({
    actor_id: opts.user_id,
    actor_email: opts.user_email ?? undefined,
    actor_role: opts.role,
    building_id: opts.building_id,
    action: "receipt.view",
    entity: "payment",
    entity_id: opts.payment_id,
  });
}

export function purposeLabel(category: string | null): string {
  switch ((category ?? "").toLowerCase()) {
    case "maintenance":
      return "Maintenance";
    case "entry_fee":
      return "Entry Fee";
    case "fine":
      return "Fine";
    case "project":
      return "Project Contribution";
    case "other":
      return "Other Charges";
    default:
      return "Maintenance";
  }
}
