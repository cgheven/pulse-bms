/**
 * Pulse platform pricing — what PulseHub charges a client BUILDING for its
 * Pulse BMS subscription.
 *
 * This is NOT the building's own maintenance billing of its residents (that
 * lives in bms_invoices / bms_payments). This module powers
 * bms_client_billing + bms_platform_invoices and the invoice PDF.
 *
 * DESIGN CONTRACT
 * ---------------
 * - Pure and dependency-free. No imports, no I/O, no `Date`, no Intl. Every
 *   function is a total function of its arguments so it can be unit-tested
 *   directly and imported from both server and client code.
 * - SOURCE OF TRUTH for the tier table is `app/pricing/page.tsx` (the public
 *   pricing page, `TIERS` + `ANNUAL_DISCOUNT = 0.2`). If that file changes,
 *   change this file in the same commit. `app/(super-admin)/super-admin/
 *   trials/trials-client.tsx` has a legacy inline `calcPulseFee()` duplicate;
 *   it should eventually call `standardMonthlyRate()` instead.
 *
 * ROUNDING RULE
 * -------------
 * Every monetary value this module returns is rounded to 2 decimal places
 * using half-away-from-zero on the *final* value only: `Math.round(n * 100) /
 * 100`. Intermediate products are kept at full float precision so that, e.g.,
 * an annual figure is `round2(monthly * 0.8 * 12)` rather than
 * `round2(round2(monthly * 0.8) * 12)` — rounding once avoids the cent-drift
 * you get from compounding rounded intermediates. In practice every tier
 * price is a multiple of 50 and the discount is 20%, so all real-world
 * results are exact integers; the rule matters only for bespoke overrides
 * and bespoke discount percentages.
 *
 * Percentages are rounded to 2dp by the same rule (the DB column is
 * numeric(5,2)).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type BillingCycle = "monthly" | "annual";

export type PricingTierKey = "starter" | "growth" | "pro";

export type PricingTier = {
  key: PricingTierKey;
  name: string;
  /** Human label for the flat-count band, e.g. "101 – 400 flats". */
  range: string;
  /** Inclusive lower bound of the flat band. */
  minFlats: number;
  /** Inclusive upper bound, or null for the open-ended top tier. */
  maxFlats: number | null;
  /**
   * "flat"    — one fixed monthly fee regardless of flat count (Starter).
   * "perFlat" — monthlyFlatFee is null and perFlatRate applies (Growth, Pro).
   */
  priceType: "flat" | "perFlat";
  /** PKR per month, whole building. Non-null only when priceType === "flat". */
  monthlyFlatFee: number | null;
  /** PKR per flat per month. Non-null only when priceType === "perFlat". */
  perFlatRate: number | null;
};

/** Fully broken-down result of {@link computeInvoiceAmounts}. */
export type InvoiceAmounts = {
  /** Standard/list price per month for this flat count (the tier price). */
  standardMonthly: number;
  /**
   * Charged price per month BEFORE the annual-cycle discount — i.e. the
   * super-admin override when one is set, otherwise `standardMonthly`.
   */
  chargedMonthly: number;
  /** 1 for a monthly invoice, 12 for an annual one. */
  periodMultiplier: number;
  /** Standard list price for the whole period: standardMonthly × multiplier. */
  standardPrice: number;
  /**
   * Actually-charged subscription for the whole period, after both the
   * override and the annual discount. Excludes onboarding.
   */
  subscriptionAmount: number;
  /**
   * standardPrice − subscriptionAmount, clamped at 0. This is the single
   * "Subscription Discount" line on the invoice and folds together BOTH the
   * super-admin override and the annual-billing discount.
   */
  discountAmount: number;
  /**
   * EFFECTIVE total discount vs. the standard list price, as a percentage,
   * for DISPLAY only (the "(NN%)" in the discount row). Clamped to 0–100.
   *
   * NOTE this is a different quantity from the `discountPct` INPUT, which is
   * the annual-billing discount rate to apply. See the input docs.
   */
  discountPct: number;
  /** PKR 10,000 on a first invoice when not waived, otherwise 0. */
  onboardingFee: number;
  /** Grand total actually invoiced: subscriptionAmount + onboardingFee. */
  amountCharged: number;
  /**
   * "Rs. N saved vs. our standard pricing" — the full-price total (standard
   * subscription + standard onboarding when this is a first invoice) minus
   * what we actually charged. Clamped at 0. A WAIVED onboarding fee counts
   * as savings.
   */
  savedVsStandard: number;
};

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Mirrors `TIERS` in app/pricing/page.tsx. Ordered ascending by band so
 * {@link resolveTier} can scan forward.
 */
export const PRICING_TIERS: readonly PricingTier[] = [
  {
    key: "starter",
    name: "Starter",
    range: "Up to 100 flats",
    minFlats: 0,
    maxFlats: 100,
    priceType: "flat",
    monthlyFlatFee: 15000,
    perFlatRate: null,
  },
  {
    key: "growth",
    name: "Growth",
    range: "101 – 400 flats",
    minFlats: 101,
    maxFlats: 400,
    priceType: "perFlat",
    monthlyFlatFee: null,
    perFlatRate: 100,
  },
  {
    key: "pro",
    name: "Pro",
    range: "401+ flats",
    minFlats: 401,
    maxFlats: null,
    priceType: "perFlat",
    monthlyFlatFee: null,
    perFlatRate: 50,
  },
] as const;

/** One-time fee, PKR. Optional and waivable per client. */
export const ONBOARDING_FEE = 10000;

/**
 * Discount applied when a client is billed annually, in percent.
 * Matches `ANNUAL_DISCOUNT = 0.2` in app/pricing/page.tsx.
 */
export const ANNUAL_DISCOUNT_PCT = 20;

// ─── Internal helpers ────────────────────────────────────────────────────────

/** The one and only rounding rule — see the file header. */
function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Coerce a caller-supplied flat count into a usable non-negative integer.
 * NaN, Infinity, null, undefined and negatives all collapse to 0, and
 * fractional counts are floored (you cannot have 4.7 flats).
 */
function normalizeFlats(flats: number): number {
  if (typeof flats !== "number" || !Number.isFinite(flats) || flats <= 0) return 0;
  return Math.floor(flats);
}

function clampPct(pct: number): number {
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct <= 0) return 0;
  return pct >= 100 ? 100 : pct;
}

// ─── Tier resolution ─────────────────────────────────────────────────────────

/**
 * Which tier a building with `flats` flats falls into.
 *
 * Boundaries are exactly those on the pricing page: <=100 Starter,
 * 101–400 Growth, >=401 Pro.
 *
 * EDGE CASES: 0 flats, a negative count, NaN and Infinity all resolve to
 * Starter, because "no flats yet" is a brand-new building on the entry tier.
 * Note this is about the tier *label* only — {@link standardMonthlyRate}
 * still returns 0 for a 0-flat building. See its docs.
 */
export function resolveTier(flats: number): PricingTier {
  const n = normalizeFlats(flats);
  for (const tier of PRICING_TIERS) {
    if (tier.maxFlats === null || n <= tier.maxFlats) return tier;
  }
  // Unreachable while the last tier is open-ended; kept for total-function
  // safety if the table is ever edited.
  return PRICING_TIERS[PRICING_TIERS.length - 1];
}

/**
 * Standard/list monthly price in PKR for a building with `flats` flats.
 *
 *   <= 100 flats  -> 15,000 flat (NOT 15,000 per flat)
 *   101-400 flats -> flats × 100
 *   401+   flats  -> flats × 50
 *
 * EDGE CASES
 * - 0 flats (also negative / NaN / Infinity, which normalise to 0) returns
 *   **0, not 15,000**. This is deliberate: an empty building has nothing to
 *   bill, and returning the Starter flat fee would let a mis-timed cron
 *   silently invoice a building that has not been set up yet. Callers that
 *   want the "what would we charge them" figure for an empty building should
 *   pass the contracted flat limit, not the live count.
 *   (This differs from the legacy `calcPulseFee()` in trials-client.tsx,
 *   which clamps to a minimum of 1 flat and so returns 15,000 for 0.)
 * - Fractional counts are floored.
 */
export function standardMonthlyRate(flats: number): number {
  const n = normalizeFlats(flats);
  if (n === 0) return 0;
  const tier = resolveTier(n);
  if (tier.priceType === "flat") return round2(tier.monthlyFlatFee ?? 0);
  return round2(n * (tier.perFlatRate ?? 0));
}

// ─── Invoice maths ───────────────────────────────────────────────────────────

export type ComputeInvoiceAmountsInput = {
  /** Flat count SNAPSHOT for this invoice. Normalised as described above. */
  flats: number;
  /**
   * Super-admin override of the charged monthly amount, PRE annual discount.
   *
   *   null / undefined -> charge the standard tier price.
   *   0                -> fully comped (a legitimate decision; yields a 100%
   *                       discount and an amount of 0, no division by zero
   *                       anywhere because we never invert a price out of a
   *                       percentage).
   *   > standardMonthly-> allowed (a premium/bespoke deal). The discount and
   *                       savings figures clamp at 0 rather than going
   *                       negative — we never print "-Rs. 2,000 saved".
   *   negative / NaN / Infinity -> ignored, falls back to the standard rate.
   */
  monthlyRateOverride?: number | null;
  billingCycle: BillingCycle;
  /**
   * The ANNUAL-BILLING discount rate in percent, applied ONLY when
   * billingCycle === "annual" (this mirrors the public pricing page, where
   * the 20% is the incentive to pay yearly). Ignored entirely on a monthly
   * invoice. Defaults to {@link ANNUAL_DISCOUNT_PCT}. Clamped to 0–100.
   *
   * Do not confuse this with the `discountPct` OUTPUT, which is the effective
   * total discount vs. standard (override + annual combined).
   */
  discountPct?: number | null;
  /** When true the PKR 10,000 onboarding fee is not charged. */
  waiveOnboarding: boolean;
  /**
   * True only for a building's literal first invoice. Onboarding can never
   * appear on a recurring invoice regardless of `waiveOnboarding`.
   */
  isFirstInvoice: boolean;
};

/**
 * The complete pricing breakdown for one invoice.
 *
 * Everything the invoice PDF prints is in the return value; the PDF must not
 * recompute anything. The invoice row snapshots these figures so a historical
 * invoice cannot change when the building grows or the tier table is
 * repriced.
 *
 * WORKED EXAMPLES
 *
 *   80 flats, monthly, no override:
 *     standardMonthly 15000, chargedMonthly 15000, multiplier 1,
 *     standardPrice 15000, subscriptionAmount 15000, discount 0 / 0%,
 *     amountCharged 15000, saved 0.
 *
 *   80 flats, monthly, override 8000 (the business requirement — standard
 *   15,000 but we choose to charge 8,000), first invoice, onboarding waived:
 *     standardPrice 15000, subscriptionAmount 8000, discountAmount 7000,
 *     discountPct 46.67, onboardingFee 0, amountCharged 8000,
 *     savedVsStandard 17000 (7000 subscription + 10000 waived onboarding).
 *
 *   250 flats, annual, no override:
 *     standardMonthly 25000, standardPrice 300000,
 *     subscriptionAmount 25000 × 0.8 × 12 = 240000,
 *     discountAmount 60000, discountPct 20, amountCharged 240000.
 *
 *   500 flats, annual, override 30000 (standard 25000 — a premium deal):
 *     standardPrice 300000, subscriptionAmount 288000,
 *     discountAmount 12000, discountPct 4. (Still a discount because the
 *     annual 20% more than offsets the higher monthly.)
 *
 *   500 flats, monthly, override 30000 (standard 25000):
 *     subscriptionAmount 30000 > standardPrice 25000 -> discountAmount 0,
 *     discountPct 0, savedVsStandard 0. Nothing goes negative.
 */
export function computeInvoiceAmounts(
  input: ComputeInvoiceAmountsInput,
): InvoiceAmounts {
  const {
    flats,
    monthlyRateOverride,
    billingCycle,
    discountPct,
    waiveOnboarding,
    isFirstInvoice,
  } = input;

  const standardMonthly = standardMonthlyRate(flats);

  // An override of exactly 0 is meaningful (fully comped), so test for
  // finiteness and sign rather than truthiness.
  const hasOverride =
    typeof monthlyRateOverride === "number" &&
    Number.isFinite(monthlyRateOverride) &&
    monthlyRateOverride >= 0;
  const chargedMonthly = round2(hasOverride ? monthlyRateOverride : standardMonthly);

  const periodMultiplier = billingCycle === "annual" ? 12 : 1;

  // The annual discount is an incentive for the annual cycle only.
  const appliedDiscountPct =
    billingCycle === "annual"
      ? clampPct(discountPct ?? ANNUAL_DISCOUNT_PCT)
      : 0;

  const standardPrice = round2(standardMonthly * periodMultiplier);
  const subscriptionAmount = round2(
    chargedMonthly * (1 - appliedDiscountPct / 100) * periodMultiplier,
  );

  // Clamped: an override above the standard rate must not print as a
  // negative discount.
  const discountAmount = round2(Math.max(0, standardPrice - subscriptionAmount));

  // Derived for display. Guarded against standardPrice === 0 (a 0-flat
  // building) — we return 0%, never NaN and never Infinity. This is exactly
  // why standardPrice is stored explicitly instead of being inverted back out
  // of a stored percentage the way HMS did it.
  const effectiveDiscountPct =
    standardPrice > 0 ? clampPct(round2((discountAmount / standardPrice) * 100)) : 0;

  const standardOnboarding = isFirstInvoice ? ONBOARDING_FEE : 0;
  const onboardingFee = isFirstInvoice && !waiveOnboarding ? ONBOARDING_FEE : 0;

  const amountCharged = round2(subscriptionAmount + onboardingFee);

  // A waived onboarding fee counts as savings, so the client sees the full
  // value of the deal. Clamped at 0 for premium/above-standard overrides.
  const savedVsStandard = round2(
    Math.max(0, standardPrice + standardOnboarding - amountCharged),
  );

  return {
    standardMonthly,
    chargedMonthly,
    periodMultiplier,
    standardPrice,
    subscriptionAmount,
    discountAmount,
    discountPct: effectiveDiscountPct,
    onboardingFee,
    amountCharged,
    savedVsStandard,
  };
}
