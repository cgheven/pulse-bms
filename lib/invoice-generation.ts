/**
 * Platform invoice generation — raising an invoice against a client BUILDING
 * for its Pulse BMS subscription.
 *
 * Shared by the super-admin "Generate Invoice Now" action (app/actions/
 * client-billing.ts) and the daily cron, so both paths produce byte-identical
 * rows. Do not duplicate this logic in either caller.
 *
 * PRICING: all arithmetic is delegated to lib/client-pricing.ts. Nothing here
 * knows what a tier costs. What this module DOES own is snapshotting the
 * result onto the invoice row so lib/platform-invoice-pdf.ts can render a
 * historical invoice without ever recomputing — an invoice must not change
 * when the building adds flats or the tier table is repriced.
 *
 * SERVER ONLY: takes a service-role client and writes billing rows.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeInvoiceAmounts,
  standardMonthlyRate,
  ANNUAL_DISCOUNT_PCT,
  type BillingCycle,
} from "@/lib/client-pricing";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AdminClient = SupabaseClient<any, any, any>;

// ─── Pakistan time ───────────────────────────────────────────────────────────
// Pakistan is a fixed UTC+5 with no DST, so a plain offset is exact. Using
// bare `new Date().toISOString()` instead would put a server running in UTC a
// day behind for the first 5 hours of every PKT day — which silently shifts
// billing periods and Net-7 due dates.
export const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Today's date in Pakistan, as "YYYY-MM-DD". */
export function pktTodayDateString(now: Date = new Date()): string {
  return new Date(now.getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

function utcMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

// ─── Period maths ────────────────────────────────────────────────────────────

export type InvoicePeriod = {
  /** "YYYY-MM-DD", inclusive start. */
  periodStart: string;
  /** "YYYY-MM-DD", exclusive end — also the next period's anchor. */
  periodEnd: string;
  /** Human label for the PDF meta box: "Aug 2026" monthly, "2026" annual. */
  label: string;
};

/**
 * The billing period a given anchor date falls at the start of.
 *
 * Monthly -> anchor .. anchor + 1 month, labelled "Aug 2026".
 * Annual  -> anchor .. anchor + 1 year,  labelled "2026".
 *
 * All arithmetic is in UTC (`Date.UTC` rolls month/year overflow correctly),
 * and the label is formatted with timeZone "UTC" so it can't drift a day.
 */
export function computeInvoicePeriod(cycle: BillingCycle, anchor: Date): InvoicePeriod {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const d = anchor.getUTCDate();

  const start = new Date(Date.UTC(y, m, d));
  const end =
    cycle === "annual" ? new Date(Date.UTC(y + 1, m, d)) : new Date(Date.UTC(y, m + 1, d));

  const label =
    cycle === "annual"
      ? String(start.getUTCFullYear())
      : start.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    label,
  };
}

/** Net 7 from the ISSUE date. */
function netSevenFrom(issueDateStr: string): string {
  const issue = utcMidnight(issueDateStr);
  return new Date(
    Date.UTC(issue.getUTCFullYear(), issue.getUTCMonth(), issue.getUTCDate() + 7),
  )
    .toISOString()
    .slice(0, 10);
}

// ─── Invoice numbers ─────────────────────────────────────────────────────────

/**
 * Alphabet for the fallback generator: uppercase base32 with the visually
 * ambiguous characters removed (no I/L/O/U, no 0/1). An invoice number gets
 * read aloud over the phone and typed into a bank transfer reference.
 */
const INVOICE_NO_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A random invoice number in the HMS family: `INV-B` + 7 characters, e.g.
 * "INV-BQ7K2MX". The leading B is for Building and keeps the shape of the
 * sequence-issued numbers ("INV-B0000042").
 *
 * THIS IS THE FALLBACK, NOT THE PRIMARY PATH. `bms_platform_invoices.invoice_no`
 * has a DB default backed by `bms_platform_invoice_no_seq`, which is
 * collision-free by construction, so {@link generateInvoiceForBuilding} omits
 * the column and lets Postgres assign it. This generator exists only for the
 * retry path — if the sequence is ever out of step with existing rows (a
 * restored dump, a manual backfill), the sequence default collides on the
 * unique index and we retry with a random number instead of failing the whole
 * generation. ~30^7 = 2.2e10 combinations, and the unique index is the real
 * guarantee either way.
 */
export function generateInvoiceNo(): string {
  const bytes = new Uint8Array(7);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += INVOICE_NO_ALPHABET[b % INVOICE_NO_ALPHABET.length];
  return `INV-B${out}`;
}

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolationOn(err: unknown, needle: string): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; details?: string };
  if (e.code !== UNIQUE_VIOLATION) return false;
  return `${e.message ?? ""} ${e.details ?? ""}`.includes(needle);
}

// ─── Generation ──────────────────────────────────────────────────────────────

export type GenerateInvoiceResult = {
  generated: boolean;
  /** Present when generated. */
  invoiceId?: string;
  /** Present when generated. */
  invoiceNo?: string;
  /** Human-readable explanation when `generated` is false. */
  reason?: string;
};

/** How many times to retry with a fresh random number on an invoice_no clash. */
const INVOICE_NO_RETRIES = 4;

/**
 * Raise the next invoice for one building.
 *
 * Never throws for the ordinary "nothing to do" cases — it returns
 * `{ generated: false, reason }` so a cron loop can keep going. It DOES throw
 * on a genuine DB failure, so a super-admin clicking Generate sees the error.
 *
 * @param admin  service-role client (writes bypass RLS)
 * @param buildingId  bms_buildings.id
 */
export async function generateInvoiceForBuilding(
  admin: AdminClient,
  buildingId: string,
): Promise<GenerateInvoiceResult> {
  // ── 1. Billing config ──
  const { data: billing, error: billingErr } = await admin
    .from("bms_client_billing")
    .select("*")
    .eq("building_id", buildingId)
    .maybeSingle();
  if (billingErr) throw billingErr;
  if (!billing) {
    return { generated: false, reason: "Billing is not set up for this building" };
  }

  const cycle: BillingCycle = billing.billing_cycle === "annual" ? "annual" : "monthly";

  // ── 2. Flat count snapshot ──
  // head+count, never a plain .select() — PostgREST caps rows at 1000, which
  // would silently under-count (and so under-price) any Pro-tier building.
  const { count: liveFlats, error: flatsErr } = await admin
    .from("bms_flats")
    .select("id", { count: "exact", head: true })
    .eq("building_id", buildingId);
  if (flatsErr) throw flatsErr;

  // A building that hasn't imported its flats yet still has a contracted size.
  // standardMonthlyRate(0) is 0 by design, so fall back to the agreed
  // flat_limit rather than raising a zero-rupee invoice.
  const { data: building, error: buildingErr } = await admin
    .from("bms_buildings")
    .select("flat_limit, total_flats")
    .eq("id", buildingId)
    .maybeSingle();
  if (buildingErr) throw buildingErr;

  const flatsCount =
    (liveFlats ?? 0) > 0
      ? (liveFlats as number)
      : Math.max(0, Number(building?.flat_limit ?? 0), Number(building?.total_flats ?? 0));

  const hasOverride = billing.monthly_rate != null;
  if (flatsCount === 0 && !hasOverride) {
    return {
      generated: false,
      reason: "This building has no flats and no agreed monthly rate — nothing to invoice",
    };
  }

  // ── 3. Period + dates ──
  const anchor = billing.next_invoice_date
    ? utcMidnight(billing.next_invoice_date)
    : utcMidnight(pktTodayDateString());
  const { periodStart, periodEnd, label } = computeInvoicePeriod(cycle, anchor);

  // Net 7 from the day the invoice is ISSUED, not from period_start. Tying it
  // to the period meant an invoice raised ahead of time looked due on day one,
  // leaving the client no window to actually pay.
  const issueDate = pktTodayDateString();
  const dueDate = netSevenFrom(issueDate);

  // ── 4. Idempotency ──
  // Checked here for a clean message; also enforced by the unique index on
  // (building_id, billing_period_start) so a cron run racing a manual click
  // can't double-insert. The insert below handles that race explicitly.
  const { data: existing, error: existingErr } = await admin
    .from("bms_platform_invoices")
    .select("id")
    .eq("building_id", buildingId)
    .eq("billing_period_start", periodStart)
    .maybeSingle();
  if (existingErr) throw existingErr;

  if (existing) {
    // Advance the anchor anyway, so a stale next_invoice_date doesn't get stuck
    // re-checking the same already-billed period forever.
    await admin
      .from("bms_client_billing")
      .update({ next_invoice_date: periodEnd })
      .eq("building_id", buildingId);
    return { generated: false, reason: "An invoice for this period already exists" };
  }

  // ── 5. Onboarding eligibility ──
  // One-time, and only ever on the building's literal first invoice — no
  // matter how billing is reconfigured afterwards.
  const { count: priorInvoices, error: priorErr } = await admin
    .from("bms_platform_invoices")
    .select("id", { count: "exact", head: true })
    .eq("building_id", buildingId);
  if (priorErr) throw priorErr;
  const isFirstInvoice = (priorInvoices ?? 0) === 0;

  // ── 6. Pricing ──
  const amounts = computeInvoiceAmounts({
    flats: flatsCount,
    monthlyRateOverride: billing.monthly_rate == null ? null : Number(billing.monthly_rate),
    billingCycle: cycle,
    discountPct:
      billing.annual_discount_pct == null ? ANNUAL_DISCOUNT_PCT : Number(billing.annual_discount_pct),
    // waive_onboarding defaults to TRUE in the schema — the fee is opt-in, so
    // it is charged only when a super-admin has explicitly turned the waiver off.
    waiveOnboarding: billing.waive_onboarding !== false,
    isFirstInvoice,
  });

  // Sanity: the standard rate the amounts were built from, snapshotted so the
  // PDF's "Standard Rs. X/month" line survives a repricing of the tier table.
  const standardMonthly = amounts.standardMonthly || standardMonthlyRate(flatsCount);

  // ── 7. Insert the snapshot ──
  const row = {
    building_id: buildingId,
    billing_period_start: periodStart,
    billing_period_end: periodEnd,
    period_label: label,
    billing_cycle: cycle,

    flats_count: flatsCount,
    standard_monthly_rate: standardMonthly,
    monthly_rate: amounts.chargedMonthly,
    discount_pct: amounts.discountPct,
    standard_amount: amounts.standardPrice,
    subscription_amount: amounts.subscriptionAmount,
    onboarding_fee_charged: amounts.onboardingFee,
    is_first_invoice: isFirstInvoice,
    amount: amounts.amountCharged,

    status: "unpaid" as const,
    issue_date: issueDate,
    due_date: dueDate,
  };

  let invoice: { id: string; invoice_no: string } | null = null;

  for (let attempt = 0; attempt <= INVOICE_NO_RETRIES; attempt++) {
    // Attempt 0 omits invoice_no so the DB sequence default assigns it (the
    // collision-free path). Later attempts supply a random one — see
    // generateInvoiceNo().
    const payload = attempt === 0 ? row : { ...row, invoice_no: generateInvoiceNo() };

    const { data, error } = await admin
      .from("bms_platform_invoices")
      .insert(payload)
      .select("id, invoice_no")
      .single();

    if (!error && data) {
      invoice = data as { id: string; invoice_no: string };
      break;
    }

    // Lost the race against a concurrent cron/manual generation for the same
    // period. Not an error — the invoice the caller wanted now exists.
    if (isUniqueViolationOn(error, "building_period")) {
      await admin
        .from("bms_client_billing")
        .update({ next_invoice_date: periodEnd })
        .eq("building_id", buildingId);
      return { generated: false, reason: "An invoice for this period already exists" };
    }

    if (isUniqueViolationOn(error, "invoice_no") && attempt < INVOICE_NO_RETRIES) {
      continue;
    }

    throw error;
  }

  if (!invoice) {
    throw new Error("Could not allocate a unique invoice number after several attempts");
  }

  // ── 8. Advance the anchor ──
  const { error: anchorErr } = await admin
    .from("bms_client_billing")
    .update({ next_invoice_date: periodEnd })
    .eq("building_id", buildingId);
  if (anchorErr) throw anchorErr;

  return { generated: true, invoiceId: invoice.id, invoiceNo: invoice.invoice_no };
}
