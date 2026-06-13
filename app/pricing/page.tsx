"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Calculator,
  Check,
  ShieldCheck,
} from "lucide-react";
import { InquiryForm } from "@/components/public/inquiry-form";

const ANNUAL_DISCOUNT = 0.2;

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
    cta: "Get Started",
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
    cta: "Get Started",
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
    cta: "Get Started",
  },
];

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
  const annualSavings = baseMonthly * 12 - annualBilled;

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
        <>
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
          {annual && (
            <div className="flex items-center justify-center gap-1.5 rounded-md bg-success/10 border border-success/30 px-3 py-1.5">
              <span className="text-[11px] font-bold tabular-nums text-success">
                You save PKR {annualSavings.toLocaleString("en-PK")} every year
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FlatFeeNotice({ annual }: { annual: boolean }) {
  const baseMonthly = 15000;
  const discountedMonthly = Math.round(baseMonthly * (1 - ANNUAL_DISCOUNT));
  const displayMonthly = annual ? discountedMonthly : baseMonthly;
  const annualBilled = discountedMonthly * 12;
  const annualSavings = baseMonthly * 12 - annualBilled;
  return (
    <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/[0.08] to-primary/[0.02] p-3 space-y-2 shadow-[0_0_20px_-10px] shadow-primary/20">
      <div className="relative h-10 flex items-center gap-2 px-3 rounded-lg border border-primary/30 bg-card">
        <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-[11px] font-bold text-primary uppercase tracking-widest">
          Flat fee — locked
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-card border border-primary/20 px-2.5 py-1.5">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
            Monthly
          </div>
          <div className="font-bold tabular-nums text-foreground">
            {displayMonthly.toLocaleString("en-PK")}
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
      {annual && (
        <div className="flex items-center justify-center gap-1.5 rounded-md bg-success/10 border border-success/30 px-3 py-1.5">
          <span className="text-[11px] font-bold tabular-nums text-success">
            You save PKR {annualSavings.toLocaleString("en-PK")} every year
          </span>
        </div>
      )}
    </div>
  );
}

const ALL_FEATURES = [
  "One-tap WhatsApp reminders to defaulters",
  "Auto maintenance bills + printable receipts",
  "Accountant-grade reports",
  "Project funds — lift, paint, generator",
  "Utility tracking — K-Electric, SSGC, water, AMCs",
  "Union governance — proposals, voting, elections",
  "Resident portal — dues, payments, complaints",
  "Rent + sale listings — visibility for the union",
  "Services marketplace — neighbors offer + find help",
  "Multi-role access — admin, union, owner, resident",
];

type Tier = (typeof TIERS)[number];

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

  const isFlat = tier.priceType === "flat";
  const headlineAmount = isFlat
    ? applyDiscount(tier.monthly ?? 0)
    : applyDiscount(tier.perFlat ?? 0);

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

      {tier.perFlat != null ? (
        <TierCalculator
          perFlat={tier.perFlat}
          annual={annual}
          flatsInput={flatsInput}
          setFlatsInput={setFlatsInput}
        />
      ) : (
        <FlatFeeNotice annual={annual} />
      )}

      <div className="mt-auto space-y-4">
        <a
          href="#contact"
          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
            tier.highlight || tier.perFlat != null
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
              : "border border-sidebar-border hover:border-primary/40 hover:bg-primary/5 text-foreground"
          }`}
        >
          {tier.cta}
          <ArrowRight className="w-3.5 h-3.5" />
        </a>

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
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
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

      {/* Feature manifest */}
      <section className="relative z-10 px-6 pb-16 max-w-5xl mx-auto">
        <div className="relative rounded-2xl border border-primary/20 bg-card overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

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
            {ALL_FEATURES.length % 2 === 1 && (
              <li aria-hidden className="hidden md:block bg-card" />
            )}
          </ul>

          <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        </div>
      </section>

      {/* Inquiry form */}
      <section id="contact" className="relative z-10 px-6 py-16 max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold text-primary uppercase tracking-widest">
              Free Demo
            </span>
          </div>
          <h2 className="text-3xl font-serif font-normal tracking-tight mb-3">
            Request a free demo
          </h2>
          <p className="text-muted-foreground">
            Fill in your details — we&apos;ll set up your building in under 24 hours.
          </p>
        </div>
        <InquiryForm dark />
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
            © 2026 Pulse. Built for buildings that mean business.
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
