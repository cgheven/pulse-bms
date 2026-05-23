"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Building2,
  Calculator,
  Check,
  ShieldCheck,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Vote,
  Wallet,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────
 * Pricing model
 *   ── Three tiers gated purely by flat count. All features are identical
 *      across tiers — the only thing that changes is how much you pay per
 *      flat as the society grows (volume discount).
 *
 *   ── Starter is a flat monthly fee (≤100 flats). Growth + Pro are
 *      per-flat to scale revenue with society size.
 *
 *   ── 20% off annual prepay across every tier. No setup fee. No card to
 *      start. Cancel anytime. Friction-removal beats per-rupee optimisation
 *      for first-time PK SaaS buyers — this is intentional.
 *
 *   ── Sales WhatsApp: 923332994029 (Pakistani int'l form, no plus).
 * ───────────────────────────────────────────────────────────────────────── */

const ANNUAL_DISCOUNT = 0.2;
const SALES_WA = "923332994029";

type TierKey = "starter" | "growth" | "pro";

const TIERS = [
  {
    key: "starter" as const,
    name: "Starter",
    range: "Up to 100 flats",
    tagline: "Small buildings = Flat monthly fee.",
    priceType: "flat" as const,
    monthly: 15000,
    perFlat: null as number | null,
    highlight: false,
    cta: "Talk to Sales",
    messageTemplate:
      "Hi, I'm interested in the Starter plan for Pulse. How do I get started?",
  },
  {
    key: "growth" as const,
    name: "Growth",
    range: "101 – 400 flats",
    tagline: "Mid-sized societies = Pay per flat.",
    priceType: "perFlat" as const,
    monthly: null as number | null,
    perFlat: 100,
    highlight: true,
    badge: "Most Popular",
    cta: "Talk to Sales",
    messageTemplate:
      "Hi, I'm interested in the Growth plan for Pulse. My society has {{flats}} flats. How do I get started?",
  },
  {
    key: "pro" as const,
    name: "Pro",
    range: "401+ flats",
    tagline: "Large societies = Best per-flat rate.",
    priceType: "perFlat" as const,
    monthly: null as number | null,
    perFlat: 50,
    highlight: false,
    cta: "Talk to Sales",
    messageTemplate:
      "Hi, I'm interested in the Pro plan for Pulse. Our society has {{flats}} flats. How do I get started?",
  },
];

/**
 * Build the WhatsApp deeplink for a tier given the visitor's flat count.
 * `{{flats}}` placeholder in the message template is replaced with the
 * actual number; if no number was entered we fall back to "___" so the
 * sales rep can ask in chat.
 */
function buildTierHref(template: string, flats: number): string {
  const filled = template.replaceAll(
    "{{flats}}",
    flats > 0 ? String(flats) : "___",
  );
  return waLink(filled);
}

/**
 * Single source of truth for tier-from-flats logic. Used by the
 * calculator AND the highlight-which-card hint, so the page can't
 * drift between display tiers and pricing tiers.
 */
function tierForFlats(flats: number): TierKey | null {
  if (flats <= 0) return null;
  if (flats <= 100) return "starter";
  if (flats <= 400) return "growth";
  return "pro";
}

function monthlyForFlats(flats: number): number {
  if (flats <= 0) return 0;
  if (flats <= 100) return 15000;
  if (flats <= 400) return flats * 100;
  return flats * 50;
}

/**
 * Compact per-card calculator. Used only on Growth + Pro (Starter is a
 * flat fee so there's nothing to calculate). Controlled — state lives
 * on the parent card so the Talk-to-Sales CTA can read the same flat
 * count and inject it into the WhatsApp message.
 */
function TierCalculator({
  perFlat,
  annual,
  flatsInput,
  setFlatsInput,
}: {
  perFlat: number;
  annual: boolean;
  flatsInput: string;
  setFlatsInput: (v: string) => void;
}) {
  const flats = Math.max(0, Math.floor(Number(flatsInput) || 0));
  const baseMonthly = flats * perFlat;
  const monthly = annual ? Math.round(baseMonthly * (1 - ANNUAL_DISCOUNT)) : baseMonthly;
  const annualBilled = Math.round(baseMonthly * (1 - ANNUAL_DISCOUNT)) * 12;

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/[0.08] to-primary/[0.02] p-3 space-y-2 shadow-[0_0_20px_-10px] shadow-primary/20">
      <div className="relative">
        <Calculator className="w-3.5 h-3.5 text-primary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Calculate — enter flat count"
          value={flatsInput}
          onChange={(e) => setFlatsInput(e.target.value)}
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-primary/30 bg-card text-foreground text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-muted-foreground/60 placeholder:font-medium placeholder:text-xs"
        />
      </div>
      {flats > 0 && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-card border border-primary/20 px-2.5 py-1.5">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
              Monthly
            </div>
            <div className="font-bold tabular-nums text-foreground">
              {monthly.toLocaleString("en-PK")}
            </div>
          </div>
          <div className="rounded-md bg-primary/10 border border-primary/30 px-2.5 py-1.5">
            <div className="text-[9px] text-primary uppercase tracking-wider">
              Annual · save 20%
            </div>
            <div className="font-bold tabular-nums text-primary">
              {annualBilled.toLocaleString("en-PK")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Starter's mirror to the TierCalculator block. Same vertical footprint
 * so all three cards stand at equal height in the grid — but instead of
 * a calculation widget, this sells the *certainty* of a flat fee. The
 * "no per-flat math" line turns the missing-calculator into a value
 * prop, not visual emptiness.
 */
function FlatFeeNotice() {
  return (
    <div className="rounded-xl border-2 border-sidebar-border bg-gradient-to-br from-card to-card/40 p-3 space-y-2 shadow-[0_0_20px_-12px] shadow-foreground/10">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest leading-none">
            Flat fee — locked
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">
            No per-flat math. No surprises.
          </p>
        </div>
      </div>
      <div className="rounded-md bg-card/60 border border-sidebar-border px-2.5 py-1.5">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
          Same price · 1 — 100 flats
        </div>
        <div className="font-bold tabular-nums text-foreground text-sm">
          PKR 15,000 / mo
        </div>
      </div>
    </div>
  );
}

// Feature list shown on EVERY tier — all plans get every feature; tiers
// only differ on flat count + per-flat economics. Ordered top-down by
// what PK committees ask about first. Each line bundles 2–3 sub-features
// so the card stays skimmable without losing substance.
const ALL_FEATURES = [
  // Row 1 — the emotional hook + the core product
  "One-tap WhatsApp reminders to defaulters",
  "Auto maintenance bills + printable receipts",
  // Row 2 — treasurer credibility + annual big-ticket pain
  "Accountant-grade reports",
  "Project funds — lift, paint, generator",
  // Row 3 — operational pain killers
  "Utility tracking — K-Electric, SSGC, water, AMCs",
  "Union governance — proposals, voting, elections",
  // Row 4 — transparency + secondary income visibility
  "Resident portal — dues, payments, complaints",
  "Rent + sale listings — visibility for the union",
  // Row 5 — community softer value + access infrastructure
  "Services marketplace — neighbors offer + find help",
  "Multi-role access — admin, union, owner, resident",
];

function waLink(text: string) {
  return `https://wa.me/${SALES_WA}?text=${encodeURIComponent(text)}`;
}

const painPoints = [
  {
    icon: Wallet,
    heading:
      "Maintenance dues collected door-to-door — half the residents 'forget' every month.",
    fix: "Auto-generated invoices, WhatsApp receipts, instant defaulter list. Collection rates climb on day 1.",
  },
  {
    icon: Shield,
    heading:
      "Residents accuse the committee of pocketing maintenance money — no way to prove otherwise.",
    fix: "Public transparency page shows every income, expense, and salary. Audit log records every change.",
  },
  {
    icon: Vote,
    heading:
      "Union meetings happen on WhatsApp — votes get lost, proposals forgotten, no record.",
    fix: "Proposals, voting, election cycles — all logged with timestamps. Disputes settle in seconds.",
  },
];

const features = [
  {
    icon: Bell,
    title: "Dues that collect themselves",
    body: "Invoices auto-generated each month. Overdue flats get a WhatsApp reminder in one tap. No manual chasing, no awkward door knocks.",
  },
  {
    icon: Vote,
    title: "Union governance that holds up in court",
    body: "Proposals, voting (majority or unanimous), elections, meetings — every decision timestamped and audit-logged. End committee disputes.",
  },
  {
    icon: TrendingUp,
    title: "Where your money goes, in plain English",
    body: "Residents see income, expenses, staff salaries, and fund balance on a single transparency page. Trust builds without an email.",
  },
  {
    icon: Sparkles,
    title: "Receipts that look like real receipts",
    body: "A5 printable receipt + PDF for every payment. Receipt numbers run sequentially per building. Auditor-friendly out of the box.",
  },
  {
    icon: Building2,
    title: "Bills you stop forgetting about",
    body: "K-Electric, SSGC, water, internet, lift AMC — track every utility bill with units consumed, due date, and late-payment flagging.",
  },
  {
    icon: Users,
    title: "Access that fits every role",
    body: "Super Admin runs the org. Admin runs the building. Union votes. Residents see their own. Nobody touches what they shouldn't.",
  },
];

type Tier = (typeof TIERS)[number];

/**
 * One pricing card. Owns its own flat-count state (when applicable) so
 * the calculator AND the Talk-to-Sales CTA can both read the same
 * value. The CTA's WhatsApp URL is built dynamically from the input —
 * if visitor entered 250 flats, the message that opens in WhatsApp
 * already says "My society has 250 flats" instead of "___ flats".
 */
function TierCard({
  tier,
  annual,
  applyDiscount,
}: {
  tier: Tier;
  annual: boolean;
  applyDiscount: (n: number) => number;
}) {
  const [flatsInput, setFlatsInput] = useState("");
  const flats = Math.max(0, Math.floor(Number(flatsInput) || 0));

  const isFlat = tier.priceType === "flat";
  const headlineAmount = isFlat
    ? applyDiscount(tier.monthly ?? 0)
    : applyDiscount(tier.perFlat ?? 0);

  // Build CTA href live — replaces {{flats}} with whatever the visitor
  // typed (or "___" placeholder if empty / not applicable).
  const ctaHref = buildTierHref(tier.messageTemplate, flats);

  return (
    <div
      className={`relative h-full rounded-2xl border p-7 flex flex-col gap-6 ${
        tier.highlight
          ? "border-primary/40 bg-primary/[0.04] shadow-[0_0_60px_-10px] shadow-primary/20"
          : "border-sidebar-border bg-card"
      }`}
    >
      {"badge" in tier && tier.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider shadow-lg">
            {tier.badge}
          </span>
        </div>
      )}

      {/* Header block — tier name, range, price, tagline */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
          {tier.name}
        </p>
        <p className="text-[11px] font-medium text-primary mb-3">{tier.range}</p>

        <div className="flex items-end gap-1 mb-1">
          <span className="text-sm text-muted-foreground">PKR</span>
          <span className="text-4xl font-bold text-foreground tabular-nums">
            {headlineAmount.toLocaleString("en-PK")}
          </span>
          <span className="text-sm text-muted-foreground pb-1">
            {isFlat ? "/mo" : "/flat /mo"}
          </span>
        </div>

        {annual && (
          <p className="text-xs text-primary mb-2">20% off — billed annually</p>
        )}

        <p className="text-sm text-muted-foreground leading-relaxed">
          {tier.tagline}
        </p>
      </div>

      {/* Info panel — calculator on Growth/Pro, flat-fee notice on Starter.
          Both have equivalent vertical footprint so the three cards stand
          at equal height in the grid. */}
      {tier.perFlat != null ? (
        <TierCalculator
          perFlat={tier.perFlat}
          annual={annual}
          flatsInput={flatsInput}
          setFlatsInput={setFlatsInput}
        />
      ) : (
        <FlatFeeNotice />
      )}

      {/* Bottom group — CTA + footer hint. mt-auto pins this to the
          bottom of the card so any uneven content above is absorbed as
          flex slack, keeping CTAs aligned across all three cards. */}
      <div className="mt-auto space-y-4">
        <Link
          href={ctaHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
            // Highlight CTA on Growth/Pro (per-flat tiers — calculator
            // drives conversion). Starter keeps outline so the highlighted
            // Growth card visually anchors.
            tier.highlight || tier.perFlat != null
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
              : "border border-sidebar-border hover:border-primary/40 hover:bg-primary/5 text-foreground"
          }`}
        >
          {tier.cta}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>

        <p className="text-[11px] text-center text-muted-foreground border-t border-sidebar-border pt-4">
          All 10 features included →
        </p>
      </div>
    </div>
  );
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  function applyDiscount(amount: number) {
    return annual ? Math.round(amount * (1 - ANNUAL_DISCOUNT)) : amount;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-primary/[0.06] blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <Link href="/" className="flex flex-col items-start">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <span className="font-serif text-xl text-foreground tracking-tight">
              Pulse
            </span>
          </div>
          <span className="text-[10px] text-primary/60 uppercase tracking-[0.2em] font-semibold ml-10 -mt-0.5">
            Pulse of your Building
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* Compact hero */}
      <section className="relative z-10 flex flex-col items-center gap-6 text-center px-6 pt-10 pb-8 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold text-primary uppercase tracking-widest">
            Rolling out in Pakistan
          </span>
        </div>

        <p className="text-muted-foreground text-sm max-w-lg">
          No setup fees. No card to start. Every feature included in every tier.
        </p>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-sidebar-border bg-card">
          <button
            onClick={() => setAnnual(false)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              !annual
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              annual
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Annual
            <span
              className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${
                annual
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-primary/10 text-primary"
              }`}
            >
              Save 20%
            </span>
          </button>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="relative z-10 px-6 pb-16 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {TIERS.map((tier) => (
            <TierCard
              key={tier.name}
              tier={tier}
              annual={annual}
              applyDiscount={applyDiscount}
            />
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          Prices in PKR. Pay less per flat as your society grows.
        </p>
      </section>

      {/* Shared feature manifest — shown ONCE, applies to all tiers.
          Editorial ledger treatment with serial numbers + hairline rows.
          Matches Pulse's accountant-grade brand voice (Day Book / Cash
          Book / receipt vouchers) rather than the generic SaaS check-grid. */}
      <section className="relative z-10 px-6 pb-16 max-w-5xl mx-auto">
        <div className="relative rounded-2xl border border-primary/20 bg-card overflow-hidden">
          {/* Top accent rule — thin amber line, signals editorial doc */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          {/* Header — kicker + serif headline + subline */}
          <div className="px-6 sm:px-10 pt-8 pb-7 border-b border-sidebar-border/80 relative">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-primary mb-2">
                  The Standard Stack
                </p>
                <h3 className="font-serif text-2xl sm:text-[28px] tracking-tight text-foreground leading-tight">
                  Every plan ships with every feature.
                </h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-md leading-relaxed">
                  Tier choice is purely about flat count. The product surface
                  itself is identical from Starter to Pro.
                </p>
              </div>
              <div className="hidden sm:flex flex-col items-end shrink-0">
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">
                  Manifest
                </span>
                <span className="text-3xl font-serif text-primary tabular-nums leading-none mt-1">
                  10
                </span>
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60 mt-1">
                  items
                </span>
              </div>
            </div>
          </div>

          {/* Ledger rows — mosaic grid with hairline gaps. Each tile
              renders bg-card; the 1px gap between tiles reveals the
              underlying border color, drawing crisp 1px dividers
              between every cell with zero per-tile border logic. */}
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-px bg-sidebar-border/60">
            {ALL_FEATURES.map((f, i) => (
              <li
                key={f}
                className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 bg-card px-6 sm:px-8 py-4 transition-colors hover:bg-primary/[0.03]"
              >
                <span className="font-mono text-[11px] font-semibold text-primary/70 group-hover:text-primary tabular-nums tracking-wider transition-colors">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-foreground text-[14px] leading-snug">
                  {f}
                </span>
                <Check className="w-4 h-4 text-primary/50 group-hover:text-primary transition-colors shrink-0" />
              </li>
            ))}
            {/* Filler tile for the empty slot when the list is odd-count.
                Matches bg-card so the mosaic stays clean on the right edge
                of the last row. */}
            {ALL_FEATURES.length % 2 === 1 && (
              <li aria-hidden className="hidden md:block bg-card" />
            )}
          </ul>

          {/* Bottom accent rule — mirror the top, closes the manifest */}
          <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        </div>
      </section>

      {/* Pain points */}
      <section className="relative z-10 px-6 py-12 max-w-6xl mx-auto">
        <p className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-8">
          Sound familiar?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {painPoints.map(({ icon: Icon, heading, fix }) => (
            <div
              key={heading}
              className="rounded-2xl border border-sidebar-border bg-card p-5 flex flex-col gap-4"
            >
              <div className="w-9 h-9 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-destructive" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {heading}
              </p>
              <div className="mt-auto pt-3 border-t border-sidebar-border">
                <div className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground leading-relaxed">{fix}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature highlights */}
      <section className="relative z-10 px-6 py-12 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-serif font-normal tracking-tight mb-3">
            Everything your building needs. Nothing it doesn&apos;t.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Built around how Pakistani residential societies actually run — not
            how a startup imagines they do.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-sidebar-border bg-card p-6 space-y-3"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative z-10 px-6 py-16 max-w-4xl mx-auto text-center">
        <div className="rounded-3xl border border-primary/20 bg-primary/[0.04] p-12">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-4xl font-serif font-normal tracking-tight mb-4">
            Your building is leaking money
            <br />
            every month you wait.
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto mb-8 leading-relaxed">
            Maintenance dues go uncollected. Expenses go untracked. Residents
            assume the worst about the committee. Most buildings fix all three in
            their first week on Pulse.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/onboarding"
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/20 text-sm"
            >
              Apply for Onboarding
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href={waLink(
                "Hi, I'm interested in Pulse for my building. Can you help me choose the right plan?",
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 rounded-xl border border-sidebar-border hover:border-primary/40 text-foreground font-semibold transition-colors text-sm"
            >
              Talk to Sales
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-sidebar-border px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Building2 className="w-3 h-3 text-primary" />
            </div>
            <span className="font-serif text-base text-foreground">Pulse</span>
          </Link>
          <p className="text-xs text-muted-foreground/60">
            © {new Date().getFullYear()} Pulse. Built for buildings that mean
            business.
          </p>
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}
