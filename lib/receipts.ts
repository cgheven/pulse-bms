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
const GROUP_COLUMNS =
  "id, building_id, invoice_id, flat_id, resident_id, amount, payment_date, payment_mode, reference_no, receipt_no, legacy_receipt_no, category, notes, payment_group_id, received_by_name, received_by_position";

export async function loadReceiptData(
  paymentId: string,
  buildingId: string,
): Promise<{ data: ReceiptCardProps; payment_row: { id: string; resident_id: string | null; flat_id: string | null } } | null> {
  const supabase = await createClient();

  // ── 1. Payment row (multi-tenant guarded) ─────────────────────
  // `legacy_receipt_no` is the pre-migration text receipt string (e.g.
  // "RCPT-DEMO-PROJ-018"). We surface it on admin + union receipts so
  // staff cross-referencing a paper book can still locate the row.
  const { data: seed } = await supabase
    .from("bms_payments")
    .select(GROUP_COLUMNS)
    .eq("id", paymentId)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!seed) return null;

  // ── 1b. The rest of the collection ────────────────────────────
  // One handover of cash can settle several months, and each month it
  // settles is its own row. The receipt is for the handover, not for one
  // row of it: we load the whole group, total it, and list the months.
  //
  // This is also why any row of the group resolves here. A resident given
  // a link to a middle row must still see their receipt, not a 404 — only
  // the anchor carries the receipt number.
  const { data: groupRows } = await supabase
    .from("bms_payments")
    .select(GROUP_COLUMNS)
    .eq("building_id", buildingId)
    .eq("payment_group_id", seed.payment_group_id ?? seed.id)
    .order("payment_date", { ascending: true });

  const rows = (groupRows?.length ? groupRows : [seed]) as typeof seed[];

  // The anchor holds the receipt number. Fall back defensively so a row
  // written before payment groups existed still renders.
  const payment =
    rows.find((r) => r.id === (seed.payment_group_id ?? seed.id)) ??
    rows.find((r) => r.receipt_no != null) ??
    seed;
  if (payment.receipt_no == null) return null;

  const groupTotal = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

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

  // ── 5. One description line per month the money settled ───────
  // A six-month advance prints six lines, so the resident can see exactly
  // which months their Rs. 30,000 bought. A single payment prints one line
  // and looks exactly as it always has.
  const invoiceIds = rows
    .map((r) => r.invoice_id)
    .filter((id): id is string => Boolean(id));

  const monthById = new Map<string, string>();
  if (invoiceIds.length > 0) {
    const { data: invs } = await supabase
      .from("bms_invoices")
      .select("id, billing_month")
      .eq("building_id", buildingId)
      .in("id", invoiceIds);
    for (const inv of invs ?? []) {
      if (inv.billing_month) monthById.set(inv.id, inv.billing_month);
    }
  }

  const monthLabel = (iso: string) =>
    new Date(iso).toLocaleDateString("en-PK", { month: "long", year: "numeric" });

  const detailed = rows
    .map((r) => {
      const month = r.invoice_id ? monthById.get(r.invoice_id) ?? null : null;
      return {
        purpose: purposeLabel(r.category),
        // A row with no invoice is money the resident has paid that no bill
        // has been raised for yet — it sits on their account until one is.
        period: month
          ? monthLabel(month)
          : r.invoice_id
            ? null
            : "Held on account",
        amount: Number(r.amount ?? 0),
        sortKey: month ?? "9999-99-99",
      };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // The receipt prints on A5, and the signature block has to stay on the
  // page. Beyond eight lines a long advance is collapsed to its range —
  // "August 2026 – July 2028 (24 months)" reads better than two dozen
  // identical rows anyway. The per-month detail is still on the flat's
  // ledger; the receipt is a summary of one handover.
  const MAX_LINES = 8;
  const plain = ({ purpose, period, amount }: (typeof detailed)[number]) => ({
    purpose,
    period,
    amount,
  });

  let lines: ReceiptCardProps["lines"];
  if (detailed.length <= MAX_LINES) {
    lines = detailed.map(plain);
  } else {
    // Only real months collapse into a range. The "Held on account" row has
    // no billing month — it sorts last by construction, so folding it in
    // made the range read "August 2026 – Held on account (25 months)". It
    // stays its own line.
    const months = detailed.filter((l) => l.sortKey !== "9999-99-99");
    const rest = detailed.filter((l) => l.sortKey === "9999-99-99");

    const grouped = new Map<
      string,
      { first: (typeof detailed)[number]; last: (typeof detailed)[number]; count: number; amount: number }
    >();
    for (const l of months) {
      const g = grouped.get(l.purpose) ?? { first: l, last: l, count: 0, amount: 0 };
      g.last = l;
      g.count += 1;
      g.amount += l.amount;
      grouped.set(l.purpose, g);
    }

    lines = [
      ...Array.from(grouped.entries()).map(([purpose, g]) => ({
        purpose,
        period:
          g.count > 1 && g.first.period && g.last.period
            ? `${g.first.period} – ${g.last.period} (${g.count} months)`
            : g.first.period,
        amount: g.amount,
      })),
      ...rest.map(plain),
    ];
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
      // The whole handover, not just the row that happens to hold the
      // receipt number. This is the figure the resident put in your hand.
      amount: groupTotal,
      method: payment.payment_mode ?? "cash",
      reference: payment.reference_no ?? null,
      received_by_name: payment.received_by_name ?? null,
      received_by_position: payment.received_by_position ?? null,
    },
    flat: { flat_number: flatNumber },
    resident: { name: residentName },
    lines,
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
