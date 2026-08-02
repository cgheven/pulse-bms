"use server";

/**
 * Pulse PLATFORM billing — server actions.
 *
 * This module is "PulseHub bills its own clients": raising subscription
 * invoices against a client BUILDING for its Pulse BMS licence. It has nothing
 * to do with `app/actions/billing.ts` / `bms_invoices` / `bms_payments`, which
 * are a building's own maintenance billing of its residents. Do not confuse
 * the two.
 *
 * TABLES
 *   bms_client_billing     — one config row per building (the override lever)
 *   bms_platform_invoices  — generated invoices, each a frozen pricing snapshot
 *
 * PRICING MATHS lives entirely in `lib/client-pricing.ts` (pure, no I/O). This
 * file never does arithmetic on money beyond reading what that module returns.
 *
 * SNAPSHOT DISCIPLINE
 *   `generateInvoice` writes flats_count, standard_monthly_rate, monthly_rate,
 *   discount_pct, standard_amount, subscription_amount, onboarding_fee_charged,
 *   is_first_invoice and amount onto the row. Nothing downstream (least of all
 *   the PDF renderer) may recompute any of them against live config — a
 *   historical invoice must stay a truthful record after the building adds
 *   flats or the tier table is repriced.
 *
 * ACCESS
 *   Every action is `requireRole(["super_admin"])` FIRST. The `sales` role is
 *   deliberately excluded even though it can reach /super-admin/trials —
 *   platform invoices are vendor-internal commercial data. Mutations
 *   additionally call `requireNotDemo()` so a demo super-admin cannot raise a
 *   real invoice (backed by RESTRICTIVE RLS policies in the migration).
 *
 * DB ACCESS uses the service-role admin client, matching app/actions/trials.ts.
 * The RLS policies on both tables exist for session-scoped reads from the UI
 * and as defence in depth, not because these actions rely on them.
 *
 * QUERY CONSTRAINTS (this Supabase project)
 *   - PostgREST aggregate syntax (`.select("amount.sum()")`) is DISABLED — it
 *     returns PGRST123 with data:null which silently becomes 0. Never used here.
 *   - max_rows is 1000, so an unbounded `.select()` truncates silently. Every
 *     list query below is explicitly `.range()`d, and counts use
 *     `{ count: "exact", head: true }`.
 *
 * RELATIONSHIP TO bms_buildings.pulse_monthly_charge
 *   SUPERSEDED, not reused. `bms_client_billing.monthly_rate` is the single
 *   source of truth for invoicing. The migration backfills from the legacy
 *   column and leaves it in place so the Trials UI keeps working; this module
 *   deliberately does NOT write it — two writable price fields would drift.
 */

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireRole, requireNotDemo } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import {
  computeInvoiceAmounts,
  standardMonthlyRate,
  resolveTier,
  ANNUAL_DISCOUNT_PCT,
} from "@/lib/client-pricing";
import { normalizePkPhone, isValidPkPhone } from "@/lib/pk-phone";
import type {
  BillingCycle,
  ClientBilling,
  InvoiceAmounts,
  PlatformInvoice,
  PlatformInvoiceStatus,
} from "@/types";

// ─── Tunables / limits ───────────────────────────────────────────────────────

/**
 * Absurdity ceiling on a monthly override, PKR. The largest legitimate figure
 * is roughly (flats × 100) for a very large Growth building — a few hundred
 * thousand. Five million is far beyond any real deal and catches fat-finger
 * entry (e.g. a stray trailing zero) before it reaches an invoice.
 */
const MAX_MONTHLY_RATE = 5_000_000;

/** Page size cap for `listInvoices`. PostgREST max_rows on this project is 1000. */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

/** How far a caller may anchor an invoice period from today, in days. */
const MAX_PERIOD_BACKDATE_DAYS = 366 * 5;
const MAX_PERIOD_FUTURE_DAYS = 366 * 2;

/** Net terms: an invoice falls due 7 days after it is ISSUED. */
const NET_TERMS_DAYS = 7;

// ─── Small validators / date helpers ─────────────────────────────────────────
//
// All date arithmetic is done in UTC on YYYY-MM-DD strings. "Today" is PKT
// (fixed UTC+5, no DST) so an invoice raised at 02:00 Karachi time carries the
// Pakistani calendar date rather than yesterday's UTC date.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

function assertUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
    throw new Error(`${label} is missing or invalid.`);
  }
  return value.trim();
}

/**
 * Parse a strict YYYY-MM-DD calendar date into a UTC-midnight Date.
 * Returns null for junk AND for impossible dates: "2026-02-31" parses to
 * 3 March, and the round-trip check catches that.
 */
function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== value) return null;
  return d;
}

function assertIsoDate(value: unknown, label: string): string {
  const d = parseIsoDate(value);
  if (!d) throw new Error(`${label} must be a valid date in YYYY-MM-DD format.`);
  return value as string;
}

function pktTodayIso(): string {
  return new Date(Date.now() + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDate(iso)!;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days),
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Add whole months, clamping the day to the target month's length so
 * 2026-01-31 + 1 month is 2026-02-28, not 2026-03-03.
 */
function addMonthsIso(iso: string, months: number): string {
  const d = parseIsoDate(iso)!;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  // Day 0 of month+1 is the last day of the target month.
  const lastDayOfTarget = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + months, Math.min(day, lastDayOfTarget)))
    .toISOString()
    .slice(0, 10);
}

/** "2026-08-01" → "Aug 2026". Always UTC so it cannot slip a month. */
function monthYearLabel(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function daysBetweenIso(a: string, b: string): number {
  const da = parseIsoDate(a)!;
  const db = parseIsoDate(b)!;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/**
 * Coerce an optional money field. `null`/`undefined` mean "not set" and pass
 * through; anything else must be a finite non-negative number inside the
 * sanity ceiling. NaN and Infinity are rejected loudly rather than silently
 * becoming 0 — a silently-zeroed rate would comp a client for free.
 */
function parseOptionalMoney(
  value: unknown,
  label: string,
  max: number,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(`${label} must be a number.`);
  }
  if (n < 0) throw new Error(`${label} cannot be negative.`);
  if (n > max) {
    throw new Error(`${label} looks wrong — it cannot exceed Rs. ${max.toLocaleString("en-PK")}.`);
  }
  // numeric(12,2) — never hand the DB more precision than the column holds.
  return Math.round(n * 100) / 100;
}

function parseCycle(value: unknown): BillingCycle {
  if (value !== "monthly" && value !== "annual") {
    throw new Error('Billing cycle must be either "monthly" or "annual".');
  }
  return value;
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

/** Paths that show platform billing data. Called after every mutation. */
function revalidateBilling(buildingId?: string | null) {
  revalidatePath("/super-admin/billing");
  revalidatePath("/super-admin/trials");
  revalidatePath("/super-admin/buildings");
  if (buildingId) revalidatePath(`/super-admin/buildings/${buildingId}`);
}

// ─── Period computation ──────────────────────────────────────────────────────

type InvoicePeriod = {
  /** Inclusive start, YYYY-MM-DD. */
  start: string;
  /** EXCLUSIVE end, YYYY-MM-DD — also the next period's anchor. */
  end: string;
  /** Human label snapshotted onto the invoice, e.g. "Aug 2026". */
  label: string;
};

/**
 * Work out the billable period from a cycle and an anchor date.
 *
 * MONTHLY — the anchor is normalised to the FIRST of its month. This is
 * deliberate: the label is month-granular ("Aug 2026"), so allowing both
 * 2026-08-01 and 2026-08-05 as anchors would let two invoices claim the same
 * period while slipping past the unique (building_id, billing_period_start)
 * index. Normalising makes the index a real duplicate guard.
 *
 * ANNUAL — the anchor is kept exactly as given, because a client who signs in
 * March pays March-to-February and forcing 1 January would misstate the term.
 * The label is the bare year when the term is calendar-aligned, otherwise the
 * explicit span ("Mar 2026 – Feb 2027") so a non-aligned year is unambiguous.
 */
function computeInvoicePeriod(cycle: BillingCycle, anchorIso: string): InvoicePeriod {
  if (cycle === "monthly") {
    const start = `${anchorIso.slice(0, 7)}-01`;
    return {
      start,
      end: addMonthsIso(start, 1),
      label: monthYearLabel(start),
    };
  }
  const start = anchorIso;
  const end = addMonthsIso(start, 12);
  const startDate = parseIsoDate(start)!;
  const calendarAligned =
    startDate.getUTCMonth() === 0 && startDate.getUTCDate() === 1;
  const label = calendarAligned
    ? String(startDate.getUTCFullYear())
    : `${monthYearLabel(start)} – ${monthYearLabel(addDaysIso(end, -1))}`;
  return { start, end, label };
}

// ─── Shared reads ────────────────────────────────────────────────────────────

type AdminDb = ReturnType<typeof createAdminClient>;

async function loadBuilding(adminDb: AdminDb, buildingId: string) {
  const { data, error } = await adminDb
    .from("bms_buildings")
    .select("id, name, city")
    .eq("id", buildingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Building not found.");
  return data as { id: string; name: string; city: string | null };
}

/**
 * Live flat count for a building.
 *
 * `head: true` + `count: "exact"` returns the count without any rows, so this
 * is correct above PostgREST's 1000-row max_rows ceiling — a plain
 * `.select("id")` would silently under-count (and therefore under-price) any
 * Pro-tier building. Never replace this with a PostgREST aggregate.
 */
async function countFlats(adminDb: AdminDb, buildingId: string): Promise<number> {
  const { count, error } = await adminDb
    .from("bms_flats")
    .select("id", { count: "exact", head: true })
    .eq("building_id", buildingId);
  if (error) throw new Error(`Could not count flats: ${error.message}`);
  return count ?? 0;
}

async function loadInvoiceOrThrow(
  adminDb: AdminDb,
  invoiceId: string,
): Promise<PlatformInvoice> {
  const { data, error } = await adminDb
    .from("bms_platform_invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invoice not found.");
  return data as PlatformInvoice;
}

// ─── Public result types ─────────────────────────────────────────────────────

export type ClientBillingInput = {
  contact_name?: string | null;
  contact_email?: string | null;
  /** Loose Pakistani input; normalised to 923xxxxxxxxx before storing. */
  contact_phone?: string | null;
  billing_cycle: BillingCycle;
  /**
   * Charged monthly amount override, PRE annual discount.
   *   null → charge the standard tier price for the live flat count
   *   0    → fully comped
   *   > 0  → charge exactly this, whatever the tier says
   */
  monthly_rate?: number | null;
  /** Applied only on the annual cycle. Defaults to 20 when omitted. */
  annual_discount_pct?: number | null;
  /** The PKR 10,000 onboarding fee is opt-in; defaults to waived. */
  waive_onboarding?: boolean;
  /** Anchor for the next invoice period. null turns automatic generation off. */
  next_invoice_date?: string | null;
  pricing_notes?: string | null;
};

export type ClientBillingView = {
  billing: ClientBilling | null;
  building: { id: string; name: string; city: string | null };
  /** LIVE flat count — for previewing only. Invoices snapshot their own. */
  flats_count: number;
  tier: { key: string; name: string; range: string };
  /** Standard list price per month for the live flat count. */
  standard_monthly_rate: number;
  /**
   * What the NEXT invoice would come to on the current config, using the live
   * flat count. Preview only — nothing is written until `generateInvoice` runs
   * and snapshots its own figures.
   */
  preview: InvoiceAmounts | null;
  /** True when this building has never been invoiced (onboarding still applies). */
  is_first_invoice: boolean;
  invoice_count: number;
};

export type PlatformInvoiceRow = PlatformInvoice & {
  building_name: string | null;
};

export type ListInvoicesParams = {
  building_id?: string | null;
  status?: PlatformInvoiceStatus | "all" | null;
  /** 0-based page index. */
  page?: number;
  /** Rows per page, capped at 100. */
  page_size?: number;
};

export type ListInvoicesResult = {
  invoices: PlatformInvoiceRow[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
};

export type GenerateInvoiceResult = {
  generated: boolean;
  /** Populated whether the invoice was just created or already existed. */
  invoice: PlatformInvoiceRow | null;
  /** Why nothing was generated, for the toast. */
  reason?: string;
};

// ─── 1. Billing config ───────────────────────────────────────────────────────

/**
 * Read the platform-billing config for one building, plus everything the
 * super-admin screen needs to render a live pricing preview.
 *
 * Read-only: no audit entry, no revalidate.
 */
export async function getClientBilling(
  buildingId: string,
): Promise<ClientBillingView> {
  await requireRole(["super_admin"]);

  const id = assertUuid(buildingId, "Building ID");
  const adminDb = createAdminClient();

  const building = await loadBuilding(adminDb, id);

  const [{ data: billingRow, error: billingErr }, flatsCount, invoiceCount] =
    await Promise.all([
      adminDb
        .from("bms_client_billing")
        .select("*")
        .eq("building_id", id)
        .maybeSingle(),
      countFlats(adminDb, id),
      countLiveInvoices(adminDb, id),
    ]);
  if (billingErr) throw new Error(billingErr.message);

  const billing = (billingRow as ClientBilling | null) ?? null;
  const tier = resolveTier(flatsCount);

  const preview = billing
    ? computeInvoiceAmounts({
        flats: flatsCount,
        monthlyRateOverride: billing.monthly_rate,
        billingCycle: billing.billing_cycle,
        discountPct: billing.annual_discount_pct,
        waiveOnboarding: billing.waive_onboarding,
        isFirstInvoice: invoiceCount === 0,
      })
    : null;

  return {
    billing,
    building,
    flats_count: flatsCount,
    tier: { key: tier.key, name: tier.name, range: tier.range },
    standard_monthly_rate: standardMonthlyRate(flatsCount),
    preview,
    is_first_invoice: invoiceCount === 0,
    invoice_count: invoiceCount,
  };
}

/**
 * Create or update a building's platform-billing config.
 *
 * Upserts on the UNIQUE building_id constraint, so calling it repeatedly is
 * safe. Fields omitted from `config` are left untouched on an existing row and
 * fall back to their column defaults on a new one.
 *
 * Note this NEVER writes bms_buildings.pulse_monthly_charge. That column is
 * superseded legacy display state owned by the Trials UI; dual-writing two
 * price fields is how they drift apart.
 */
export async function upsertClientBilling(
  buildingId: string,
  config: ClientBillingInput,
): Promise<ClientBilling> {
  const { user, profile } = await requireRole(["super_admin"]);
  await requireNotDemo();

  const id = assertUuid(buildingId, "Building ID");
  if (!config || typeof config !== "object") {
    throw new Error("Billing settings are required.");
  }

  const cycle = parseCycle(config.billing_cycle);

  const monthlyRate = parseOptionalMoney(
    config.monthly_rate,
    "Monthly rate",
    MAX_MONTHLY_RATE,
  );

  let discountPct = ANNUAL_DISCOUNT_PCT;
  if (config.annual_discount_pct !== undefined && config.annual_discount_pct !== null) {
    const raw =
      typeof config.annual_discount_pct === "string"
        ? Number(config.annual_discount_pct)
        : config.annual_discount_pct;
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      throw new Error("Annual discount must be a number.");
    }
    if (raw < 0 || raw > 100) {
      throw new Error("Annual discount must be between 0 and 100 percent.");
    }
    discountPct = Math.round(raw * 100) / 100;
  }

  const email = trimOrNull(config.contact_email)?.toLowerCase() ?? null;
  if (email && !EMAIL_RE.test(email)) {
    throw new Error("Please enter a valid contact email address.");
  }

  let phone: string | null = null;
  const rawPhone = trimOrNull(config.contact_phone);
  if (rawPhone) {
    phone = normalizePkPhone(rawPhone);
    if (!isValidPkPhone(phone)) {
      throw new Error("Please enter a valid contact phone number.");
    }
  }

  const nextInvoiceDate =
    config.next_invoice_date === null || config.next_invoice_date === undefined
      ? null
      : assertIsoDate(config.next_invoice_date, "Next invoice date");

  const contactName = trimOrNull(config.contact_name);
  if (contactName && contactName.length > 120) {
    throw new Error("Contact name is too long (max 120 characters).");
  }
  const notes = trimOrNull(config.pricing_notes);
  if (notes && notes.length > 2000) {
    throw new Error("Pricing notes are too long (max 2000 characters).");
  }

  const adminDb = createAdminClient();
  const building = await loadBuilding(adminDb, id);

  const payload: Record<string, unknown> = {
    building_id: id,
    contact_name: contactName,
    contact_email: email,
    contact_phone: phone,
    billing_cycle: cycle,
    monthly_rate: monthlyRate,
    annual_discount_pct: discountPct,
    waive_onboarding:
      config.waive_onboarding === undefined ? true : Boolean(config.waive_onboarding),
    next_invoice_date: nextInvoiceDate,
    pricing_notes: notes,
  };

  const { data, error } = await adminDb
    .from("bms_client_billing")
    .upsert(payload, { onConflict: "building_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const saved = data as ClientBilling;

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    // building_id is deliberately NULL on every platform_billing event.
    // bms_audit_log's SELECT policy is building-scoped:
    //   role IN ('admin','union') AND building_id = bms_current_building()
    // so tagging these rows with the CLIENT's building would let that client
    // read our negotiated rate, discount and waiver straight out of PostgREST
    // with their own JWT — the exact commercial data this feature exists to
    // keep private. NULL means only super_admin (and the acting user) can see
    // them; the building reference is preserved inside meta instead.
    building_id: null,
    action: "platform_billing.upsert_config",
    entity: "client_billing",
    entity_id: saved.id,
    meta: {
      building_id: id,
      building_name: building.name,
      billing_cycle: saved.billing_cycle,
      monthly_rate: saved.monthly_rate,
      annual_discount_pct: saved.annual_discount_pct,
      waive_onboarding: saved.waive_onboarding,
      next_invoice_date: saved.next_invoice_date,
    },
  });

  revalidateBilling(id);
  return saved;
}

// ─── 2. Invoice generation ───────────────────────────────────────────────────

/**
 * Count invoices that still "exist" commercially.
 *
 * Cancelled invoices are excluded, so a mis-generated first invoice that was
 * cancelled does not permanently disqualify the building from the onboarding
 * fee. Deletion is the other way back to a clean slate.
 */
async function countLiveInvoices(
  adminDb: AdminDb,
  buildingId: string,
): Promise<number> {
  const { count, error } = await adminDb
    .from("bms_platform_invoices")
    .select("id", { count: "exact", head: true })
    .eq("building_id", buildingId)
    .neq("status", "cancelled");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Raise one platform invoice for a building.
 *
 * @param buildingId   The client building being invoiced.
 * @param periodStart  Optional anchor (YYYY-MM-DD) for the billable period.
 *                     Defaults to the config's `next_invoice_date`, then to
 *                     PKT today. For the monthly cycle it is normalised to the
 *                     first of that month (see `computeInvoicePeriod`).
 *
 * BEHAVIOUR
 * - Snapshots the flat count from bms_flats AT GENERATION TIME and freezes the
 *   full pricing breakdown onto the row. Nothing is ever recomputed later.
 * - `is_first_invoice` is true only when the building has no non-cancelled
 *   invoices. The onboarding fee is charged only when it is a first invoice
 *   AND `waive_onboarding` is explicitly false (the column defaults to true —
 *   the fee is opt-in).
 * - Idempotent on (building_id, billing_period_start): if that period already
 *   has an invoice, nothing is inserted and the existing row is returned. The
 *   config's `next_invoice_date` is still advanced so a stale anchor cannot
 *   wedge generation on a period that is already billed. The DB unique index
 *   is the real guard — the pre-check is only there to produce a friendly
 *   message instead of a 23505.
 * - `invoice_no` comes from the `bms_platform_invoice_no_seq` Postgres
 *   sequence via the column default: atomic, monotonic and collision-free even
 *   under concurrency, which is exactly what an app-side counter would not be.
 * - `share_token` is generated here with `crypto.randomUUID()` (CSPRNG, 122
 *   bits) rather than left to the column default, so the value is explicit and
 *   auditable in one place. It is the ONLY credential guarding the public
 *   /invoice/[token] PDF, so it is never written to the audit log.
 */
export async function generateInvoice(
  buildingId: string,
  periodStart?: string | null,
): Promise<GenerateInvoiceResult> {
  const { user, profile } = await requireRole(["super_admin"]);
  await requireNotDemo();

  const id = assertUuid(buildingId, "Building ID");
  const adminDb = createAdminClient();
  const building = await loadBuilding(adminDb, id);

  const { data: billingRow, error: billingErr } = await adminDb
    .from("bms_client_billing")
    .select("*")
    .eq("building_id", id)
    .maybeSingle();
  if (billingErr) throw new Error(billingErr.message);
  if (!billingRow) {
    throw new Error(
      "Billing is not set up for this building yet. Save its billing settings first.",
    );
  }
  const billing = billingRow as ClientBilling;

  const today = pktTodayIso();

  // Anchor precedence: explicit argument → configured next_invoice_date → today.
  const anchorRaw =
    periodStart !== undefined && periodStart !== null && periodStart !== ""
      ? assertIsoDate(periodStart, "Billing period start")
      : (billing.next_invoice_date ?? today);
  const anchor = assertIsoDate(anchorRaw, "Billing period start");

  // Reject anchors that are almost certainly a typo (e.g. "2062-08-01").
  const drift = daysBetweenIso(today, anchor);
  if (drift < -MAX_PERIOD_BACKDATE_DAYS) {
    throw new Error("That billing period starts more than 5 years in the past.");
  }
  if (drift > MAX_PERIOD_FUTURE_DAYS) {
    throw new Error("That billing period starts more than 2 years in the future.");
  }

  const period = computeInvoicePeriod(billing.billing_cycle, anchor);

  // Friendly idempotency pre-check. The unique index is the real guarantee.
  const { data: existingRow, error: existingErr } = await adminDb
    .from("bms_platform_invoices")
    .select("*, building:bms_buildings(name)")
    .eq("building_id", id)
    .eq("billing_period_start", period.start)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);
  if (existingRow) {
    // Still advance the anchor: leaving it parked on an already-billed period
    // would make every future run a no-op.
    await advanceNextInvoiceDate(adminDb, id, period.end);
    revalidateBilling(id);
    return {
      generated: false,
      invoice: toInvoiceRow(existingRow),
      reason: `An invoice for ${period.label} already exists (${(existingRow as PlatformInvoice).invoice_no}).`,
    };
  }

  const [flatsCount, liveInvoiceCount] = await Promise.all([
    countFlats(adminDb, id),
    countLiveInvoices(adminDb, id),
  ]);

  // A building with no flats and no explicit override has no defensible price
  // — standardMonthlyRate(0) is 0 by design. Refuse rather than quietly issue
  // a Rs. 0 invoice that looks like a bug to the client.
  if (flatsCount === 0 && billing.monthly_rate === null) {
    throw new Error(
      "This building has no flats yet, so there is no tier price to invoice. Add flats or set an explicit monthly rate first.",
    );
  }

  const isFirstInvoice = liveInvoiceCount === 0;

  const amounts = computeInvoiceAmounts({
    flats: flatsCount,
    monthlyRateOverride: billing.monthly_rate,
    billingCycle: billing.billing_cycle,
    discountPct: billing.annual_discount_pct,
    waiveOnboarding: billing.waive_onboarding,
    isFirstInvoice,
  });

  const issueDate = today;
  const dueDate = addDaysIso(issueDate, NET_TERMS_DAYS);

  const { data: inserted, error: insertErr } = await adminDb
    .from("bms_platform_invoices")
    .insert({
      building_id: id,
      billing_period_start: period.start,
      billing_period_end: period.end,
      period_label: period.label,
      billing_cycle: billing.billing_cycle,

      // ── frozen pricing snapshot ──
      flats_count: flatsCount,
      standard_monthly_rate: amounts.standardMonthly,
      monthly_rate: amounts.chargedMonthly,
      discount_pct: amounts.discountPct,
      standard_amount: amounts.standardPrice,
      subscription_amount: amounts.subscriptionAmount,
      onboarding_fee_charged: amounts.onboardingFee,
      is_first_invoice: isFirstInvoice,
      amount: amounts.amountCharged,

      // ── lifecycle ──
      status: "unpaid",
      issue_date: issueDate,
      due_date: dueDate,
      share_token: randomUUID(),
    })
    .select("*, building:bms_buildings(name)")
    .single();

  if (insertErr) {
    // 23505 = a concurrent run (cron vs. a manual click) won the race.
    if (insertErr.code === "23505") {
      await advanceNextInvoiceDate(adminDb, id, period.end);
      revalidateBilling(id);
      return {
        generated: false,
        invoice: null,
        reason: `An invoice for ${period.label} already exists.`,
      };
    }
    throw new Error(insertErr.message);
  }

  const invoice = toInvoiceRow(inserted);

  await advanceNextInvoiceDate(adminDb, id, period.end);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    // NULL — see upsert_config above. Generation meta carries the rate and
    // discount, which must never be readable by the client being billed.
    building_id: null,
    action: "platform_billing.generate_invoice",
    entity: "platform_invoice",
    entity_id: invoice.id,
    meta: {
      // share_token is deliberately absent — it is the credential for the
      // unauthenticated PDF route and must never land in the audit log.
      building_name: building.name,
      invoice_no: invoice.invoice_no,
      period_label: period.label,
      billing_cycle: billing.billing_cycle,
      flats_count: flatsCount,
      standard_amount: amounts.standardPrice,
      subscription_amount: amounts.subscriptionAmount,
      onboarding_fee_charged: amounts.onboardingFee,
      discount_pct: amounts.discountPct,
      amount: amounts.amountCharged,
      is_first_invoice: isFirstInvoice,
    },
  });

  revalidateBilling(id);
  return { generated: true, invoice };
}

async function advanceNextInvoiceDate(
  adminDb: AdminDb,
  buildingId: string,
  nextIso: string,
) {
  const { error } = await adminDb
    .from("bms_client_billing")
    .update({ next_invoice_date: nextIso })
    .eq("building_id", buildingId);
  // Non-fatal: the invoice itself is already written and correct. Advancing
  // the anchor is a scheduling convenience, not part of the financial record.
  if (error) {
    console.error("[client-billing] could not advance next_invoice_date:", error.message);
  }
}

/** Flatten the embedded `building:bms_buildings(name)` join into a flat row. */
function toInvoiceRow(row: unknown): PlatformInvoiceRow {
  const { building, ...rest } = row as PlatformInvoice & {
    building?: { name: string } | null;
  };
  return { ...rest, building_name: building?.name ?? null };
}

// ─── 3. Status transitions ───────────────────────────────────────────────────

/**
 * Mark an invoice settled. Records who confirmed it and when.
 *
 * A cancelled invoice cannot be marked paid — reopen it with
 * {@link markInvoicePending} first, so the transition is explicit and shows up
 * as two audit entries rather than one silent resurrection.
 *
 * @param paidAt Optional YYYY-MM-DD the payment actually landed (bank
 *               transfers are usually confirmed a day or two later). Stored as
 *               UTC midnight of that date; defaults to now.
 */
export async function markInvoicePaid(
  invoiceId: string,
  paidAt?: string | null,
): Promise<PlatformInvoice> {
  const { user, profile } = await requireRole(["super_admin"]);
  await requireNotDemo();

  const id = assertUuid(invoiceId, "Invoice ID");
  const adminDb = createAdminClient();
  const existing = await loadInvoiceOrThrow(adminDb, id);

  if (existing.status === "cancelled") {
    throw new Error(
      "This invoice is cancelled. Reopen it as pending before marking it paid.",
    );
  }
  if (existing.status === "paid") return existing;

  let paidAtIso = new Date().toISOString();
  if (paidAt) {
    const d = assertIsoDate(paidAt, "Payment date");
    const drift = daysBetweenIso(pktTodayIso(), d);
    if (drift > 1) throw new Error("The payment date cannot be in the future.");
    if (drift < -MAX_PERIOD_BACKDATE_DAYS) {
      throw new Error("That payment date is more than 5 years in the past.");
    }
    paidAtIso = `${d}T00:00:00.000Z`;
  }

  const { data, error } = await adminDb
    .from("bms_platform_invoices")
    .update({ status: "paid", paid_at: paidAtIso, marked_paid_by: user.id })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    // NULL for the same reason as upsert_config above — a building-scoped
    // audit row is readable by that building's own admin/union. The invoice
    // (entity_id) still carries building_id for super-admin traceability.
    building_id: null,
    action: "platform_billing.mark_invoice_paid",
    entity: "platform_invoice",
    entity_id: id,
    meta: {
      invoice_no: existing.invoice_no,
      amount: existing.amount,
      previous_status: existing.status,
      paid_at: paidAtIso,
    },
  });

  revalidateBilling(existing.building_id);
  return data as PlatformInvoice;
}

/**
 * Put an invoice back to pending payment.
 *
 * Valid from both `paid` (correcting a mistaken confirmation) and `cancelled`
 * (reopening). Clears `paid_at` / `marked_paid_by` so a reverted invoice
 * carries no stale settlement trail.
 */
export async function markInvoicePending(
  invoiceId: string,
): Promise<PlatformInvoice> {
  const { user, profile } = await requireRole(["super_admin"]);
  await requireNotDemo();

  const id = assertUuid(invoiceId, "Invoice ID");
  const adminDb = createAdminClient();
  const existing = await loadInvoiceOrThrow(adminDb, id);

  if (existing.status === "unpaid") return existing;

  const { data, error } = await adminDb
    .from("bms_platform_invoices")
    .update({ status: "unpaid", paid_at: null, marked_paid_by: null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    // NULL for the same reason as upsert_config above — a building-scoped
    // audit row is readable by that building's own admin/union. The invoice
    // (entity_id) still carries building_id for super-admin traceability.
    building_id: null,
    action: "platform_billing.mark_invoice_pending",
    entity: "platform_invoice",
    entity_id: id,
    meta: {
      invoice_no: existing.invoice_no,
      amount: existing.amount,
      previous_status: existing.status,
    },
  });

  revalidateBilling(existing.building_id);
  return data as PlatformInvoice;
}

/**
 * Void an invoice while keeping it on the record.
 *
 * This is the preferred alternative to {@link deleteInvoice}: the invoice
 * number stays allocated and the history stays auditable. A PAID invoice
 * cannot be cancelled — money has changed hands, so it must be reverted to
 * pending first (which is itself audited) before it can be voided.
 *
 * The 'cancelled' status exists in the CHECK constraint precisely so this
 * action can set it; without it the state would be unreachable dead code.
 */
export async function cancelInvoice(
  invoiceId: string,
  reason?: string | null,
): Promise<PlatformInvoice> {
  const { user, profile } = await requireRole(["super_admin"]);
  await requireNotDemo();

  const id = assertUuid(invoiceId, "Invoice ID");
  const note = trimOrNull(reason);
  if (note && note.length > 500) {
    throw new Error("Cancellation reason is too long (max 500 characters).");
  }

  const adminDb = createAdminClient();
  const existing = await loadInvoiceOrThrow(adminDb, id);

  if (existing.status === "paid") {
    throw new Error(
      "This invoice is already paid. Mark it pending first if you really need to cancel it.",
    );
  }
  if (existing.status === "cancelled") return existing;

  const { data, error } = await adminDb
    .from("bms_platform_invoices")
    .update({
      status: "cancelled",
      paid_at: null,
      marked_paid_by: null,
      notes: note ?? existing.notes,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    // NULL for the same reason as upsert_config above — a building-scoped
    // audit row is readable by that building's own admin/union. The invoice
    // (entity_id) still carries building_id for super-admin traceability.
    building_id: null,
    action: "platform_billing.cancel_invoice",
    entity: "platform_invoice",
    entity_id: id,
    meta: {
      invoice_no: existing.invoice_no,
      amount: existing.amount,
      previous_status: existing.status,
      reason: note,
    },
  });

  revalidateBilling(existing.building_id);
  return data as PlatformInvoice;
}

// ─── 4. Deletion ─────────────────────────────────────────────────────────────

/**
 * Permanently remove an invoice.
 *
 * POLICY — a PAID invoice can NEVER be deleted.
 *   A paid platform invoice is a settled commercial record: it is the evidence
 *   behind money that actually moved into the UBL account, it may already have
 *   been shared with the client as a PDF, and it is what an onboarding-fee or
 *   revenue reconciliation is built from. Erasing it would leave a payment
 *   with no document behind it. Correcting a genuine mistake is a two-step,
 *   fully-audited path instead: `markInvoicePending` → `cancelInvoice`, which
 *   keeps the invoice number allocated and the history intact.
 *
 *   `unpaid` and `cancelled` invoices MAY be deleted, because those are the
 *   states a mis-generated invoice lands in (wrong period, wrong rate, test
 *   data) and nothing financial depends on them. Deleting the only invoice a
 *   building has also restores `is_first_invoice`, which is the sanctioned way
 *   to re-enable the onboarding fee after a bad first run.
 *
 * Prefer `cancelInvoice` in normal operation; this is the escape hatch.
 * Deleting does NOT recycle the invoice number — the sequence moves on, and a
 * gap in the numbering is far better than a reused number.
 */
export async function deleteInvoice(invoiceId: string): Promise<{ deleted: true }> {
  const { user, profile } = await requireRole(["super_admin"]);
  await requireNotDemo();

  const id = assertUuid(invoiceId, "Invoice ID");
  const adminDb = createAdminClient();
  const existing = await loadInvoiceOrThrow(adminDb, id);

  if (existing.status === "paid") {
    throw new Error(
      "A paid invoice cannot be deleted — it is a settled record. Mark it pending and cancel it instead.",
    );
  }

  const { error } = await adminDb
    .from("bms_platform_invoices")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    // NULL for the same reason as upsert_config above — a building-scoped
    // audit row is readable by that building's own admin/union. The invoice
    // (entity_id) still carries building_id for super-admin traceability.
    building_id: null,
    action: "platform_billing.delete_invoice",
    entity: "platform_invoice",
    entity_id: id,
    meta: {
      invoice_no: existing.invoice_no,
      period_label: existing.period_label,
      amount: existing.amount,
      status_at_deletion: existing.status,
    },
  });

  revalidateBilling(existing.building_id);
  return { deleted: true };
}

// ─── 5. Reads for the UI ─────────────────────────────────────────────────────

/**
 * Paged invoice list, newest period first.
 *
 * Always `.range()`d. An unbounded `.select()` would silently truncate at
 * PostgREST's max_rows (1000 on this project), which on a cross-client billing
 * screen would quietly hide the oldest clients' invoices. `count: "exact"`
 * gives the true total without a PostgREST aggregate (which is disabled here
 * and returns null → 0).
 *
 * Read-only: no audit entry, no revalidate.
 */
export async function listInvoices(
  params: ListInvoicesParams = {},
): Promise<ListInvoicesResult> {
  await requireRole(["super_admin"]);

  const buildingId =
    params.building_id === undefined || params.building_id === null || params.building_id === ""
      ? null
      : assertUuid(params.building_id, "Building ID");

  const status =
    params.status && params.status !== "all" ? params.status : null;
  if (status && !["unpaid", "paid", "cancelled"].includes(status)) {
    throw new Error("Invalid invoice status filter.");
  }

  const rawPage = Number(params.page ?? 0);
  const page =
    Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 0;

  const rawSize = Number(params.page_size ?? DEFAULT_PAGE_SIZE);
  const pageSize =
    Number.isFinite(rawSize) && rawSize > 0
      ? Math.min(Math.floor(rawSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  const from = page * pageSize;
  const to = from + pageSize - 1;

  const adminDb = createAdminClient();
  let query = adminDb
    .from("bms_platform_invoices")
    .select("*, building:bms_buildings(name)", { count: "exact" })
    .order("billing_period_start", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (buildingId) query = query.eq("building_id", buildingId);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const invoices = (data ?? []).map(toInvoiceRow);
  const total = count ?? invoices.length;

  return {
    invoices,
    total,
    page,
    page_size: pageSize,
    has_more: from + invoices.length < total,
  };
}

/**
 * One invoice with its building name, for the detail/share panel.
 *
 * Returns the `share_token` because the caller is a verified super_admin and
 * needs it to build the /invoice/[token] link. Never surface this payload to
 * any other role.
 *
 * Read-only: no audit entry, no revalidate.
 */
export async function getInvoice(
  invoiceId: string,
): Promise<PlatformInvoiceRow | null> {
  await requireRole(["super_admin"]);

  const id = assertUuid(invoiceId, "Invoice ID");
  const adminDb = createAdminClient();

  const { data, error } = await adminDb
    .from("bms_platform_invoices")
    .select("*, building:bms_buildings(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return toInvoiceRow(data);
}
