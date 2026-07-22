"use client";

import { useState } from "react";
import Link from "next/link";
import { DM_Sans } from "next/font/google";
import {
  ArrowRight,
  Building2,
  Calculator,
  Check,
  ShieldCheck,
} from "lucide-react";
import { InquiryForm } from "@/components/public/inquiry-form";

const dm = DM_Sans({ subsets: ["latin"], weight: ["400","500","600","700"], display: "swap" });

const C = {
  white:      "#FFFFFF",
  bgSoft:     "#F8FAFC",
  teal:       "#0F766E",
  tealMed:    "#0D9488",
  tealSoft:   "rgba(15,118,110,0.08)",
  tealBorder: "rgba(15,118,110,0.16)",
  tealHover:  "#0B6962",
  ink:        "#0F172A",
  inkMid:     "#475569",
  inkLight:   "#94A3B8",
  border:     "#E2E8F0",
  borderMed:  "#CBD5E1",
  green:      "#16A34A",
  greenSoft:  "rgba(22,163,74,0.08)",
  orange:     "#D97706",
  orangeSoft: "rgba(217,119,6,0.08)",
};

const ANNUAL_DISCOUNT = 0.2;

type TierKey = "starter" | "growth" | "pro";

const TIERS = [
  {
    key: "starter" as const,
    name: "Starter",
    range: "Up to 100 flats",
    tagline: "Small buildings — flat monthly fee.",
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
    tagline: "Mid-sized societies — pay per flat.",
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
    tagline: "Large societies — best per-flat rate.",
    priceType: "perFlat" as const,
    monthly: null as number | null,
    perFlat: 50,
    highlight: false,
    cta: "Get Started",
  },
];

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

function TierCard({ tier, annual, applyDiscount }: { tier: Tier; annual: boolean; applyDiscount: (n: number) => number }) {
  const [flatsInput, setFlatsInput] = useState("");
  const isFlat = tier.priceType === "flat";
  const headlineAmount = isFlat ? applyDiscount(tier.monthly ?? 0) : applyDiscount(tier.perFlat ?? 0);
  const dark = tier.highlight;

  const txt    = dark ? "#FFFFFF"                    : C.ink;
  const txtMid = dark ? "rgba(255,255,255,0.65)"     : C.inkMid;
  const txtDim = dark ? "rgba(255,255,255,0.38)"     : C.inkLight;
  const bdr    = dark ? "rgba(255,255,255,0.10)"     : C.border;
  const accent = dark ? "#2DD4BF"                    : C.teal;
  const calcBg = dark ? "rgba(255,255,255,0.06)"     : C.tealSoft;
  const calcBdr= dark ? "rgba(255,255,255,0.12)"     : C.tealBorder;
  const inpBg  = dark ? "rgba(255,255,255,0.07)"     : C.white;

  // Inline calculator values
  const flats       = Math.max(0, Math.floor(Number(flatsInput) || 0));
  const baseMonthly = flats * (tier.perFlat ?? 0);
  const monthly     = annual ? Math.round(baseMonthly * (1 - ANNUAL_DISCOUNT)) : baseMonthly;
  const annualBill  = Math.round(baseMonthly * (1 - ANNUAL_DISCOUNT)) * 12;
  const annualSave  = baseMonthly * 12 - annualBill;

  // Inline flat-fee values
  const flatBase   = 15000;
  const flatDisc   = Math.round(flatBase * (1 - ANNUAL_DISCOUNT));
  const flatDisplay= annual ? flatDisc : flatBase;
  const flatAnnual = flatDisc * 12;
  const flatSave   = flatBase * 12 - flatAnnual;

  return (
    <div style={{
      position: "relative",
      height: "100%",
      borderRadius: 24,
      background: dark
        ? "linear-gradient(145deg, #0A1628 0%, #0C3330 100%)"
        : C.white,
      border: dark ? "1px solid rgba(45,212,191,0.18)" : `1px solid ${C.border}`,
      padding: "36px 30px 30px",
      display: "flex",
      flexDirection: "column",
      gap: 24,
      boxShadow: dark
        ? "0 32px 80px rgba(10,22,40,0.55), 0 0 0 1px rgba(45,212,191,0.10), inset 0 1px 0 rgba(255,255,255,0.06)"
        : "0 2px 12px rgba(0,0,0,0.06)",
      transform: dark ? "scale(1.04)" : "scale(1)",
      zIndex: dark ? 2 : 1,
    }}>

      {/* Top accent stripe for light cards */}
      {!dark && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, borderRadius: "24px 24px 0 0", background: C.teal }} />
      )}

      {"badge" in tier && tier.badge && (
        <div style={{ position: "absolute", top: dark ? -16 : -15, left: "50%", transform: "translateX(-50%)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 14px", borderRadius: 20, background: dark ? "#F59E0B" : C.ink, color: dark ? "#0A1628" : C.white, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
            ★ {tier.badge}
          </span>
        </div>
      )}

      {/* Header */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, color: txtDim, letterSpacing: "0.14em", margin: "0 0 3px" }}>{tier.name.toUpperCase()}</p>
        <p style={{ fontSize: 12, fontWeight: 600, color: accent, margin: "0 0 18px" }}>{tier.range}</p>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, marginBottom: 2 }}>
          <span style={{ fontSize: 14, color: txtMid, paddingBottom: 10, fontWeight: 500 }}>PKR</span>
          <span style={{ fontSize: dark ? 64 : 54, fontWeight: 800, color: dark ? accent : C.ink, letterSpacing: "-0.04em", lineHeight: 1 }}>
            {headlineAmount.toLocaleString("en-PK")}
          </span>
          <span style={{ fontSize: 14, color: txtMid, paddingBottom: 10, fontWeight: 500 }}>{isFlat ? "/mo" : "/flat"}</span>
        </div>
        {!isFlat && <p style={{ fontSize: 11, color: txtDim, margin: "0 0 6px" }}>per month</p>}
        {annual && (
          <p style={{ fontSize: 12, color: accent, fontWeight: 700, margin: "4px 0 8px" }}>20% off — billed annually</p>
        )}
        <p style={{ fontSize: 14, color: txtMid, lineHeight: 1.6, margin: 0 }}>{tier.tagline}</p>
      </div>

      {/* Calculator / flat-fee box */}
      <div style={{ borderRadius: 14, border: `1.5px solid ${calcBdr}`, background: calcBg, padding: 14 }}>
        {isFlat ? (
          <>
            <div style={{ height: 40, display: "flex", alignItems: "center", gap: 8, borderRadius: 8, border: `1px solid ${calcBdr}`, background: inpBg, padding: "0 12px", marginBottom: 10 }}>
              <ShieldCheck style={{ width: 14, height: 14, color: accent, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.1em" }}>FLAT FEE — LOCKED</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: annual ? 8 : 0 }}>
              <div style={{ borderRadius: 8, background: inpBg, border: `1px solid ${calcBdr}`, padding: "8px 10px" }}>
                <p style={{ fontSize: 9, color: txtDim, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 3px" }}>MONTHLY</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: txt, margin: 0 }}>PKR {flatDisplay.toLocaleString("en-PK")}</p>
              </div>
              <div style={{ borderRadius: 8, background: dark ? "rgba(45,212,191,0.1)" : C.tealSoft, border: `1px solid ${calcBdr}`, padding: "8px 10px" }}>
                <p style={{ fontSize: 9, color: accent, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 3px" }}>ANNUAL · SAVE 20%</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: accent, margin: 0 }}>PKR {flatAnnual.toLocaleString("en-PK")}</p>
              </div>
            </div>
            {annual && (
              <div style={{ borderRadius: 8, background: dark ? "rgba(22,163,74,0.15)" : C.greenSoft, border: "1px solid rgba(22,163,74,0.25)", padding: "8px 12px", textAlign: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>You save PKR {flatSave.toLocaleString("en-PK")} every year</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ position: "relative", marginBottom: flats > 0 ? 10 : 0 }}>
              <Calculator style={{ width: 14, height: 14, color: accent, position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="Enter flat count to calculate"
                value={flatsInput}
                onChange={(e) => setFlatsInput(e.target.value)}
                style={{ width: "100%", height: 40, paddingLeft: 36, paddingRight: 12, borderRadius: 8, border: `1px solid ${calcBdr}`, background: inpBg, color: txt, fontSize: 13, fontWeight: 600, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>
            {flats > 0 && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: annual ? 8 : 0 }}>
                  <div style={{ borderRadius: 8, background: inpBg, border: `1px solid ${calcBdr}`, padding: "8px 10px" }}>
                    <p style={{ fontSize: 9, color: txtDim, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 3px" }}>MONTHLY</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: txt, margin: 0 }}>PKR {monthly.toLocaleString("en-PK")}</p>
                  </div>
                  <div style={{ borderRadius: 8, background: dark ? "rgba(45,212,191,0.1)" : C.tealSoft, border: `1px solid ${calcBdr}`, padding: "8px 10px" }}>
                    <p style={{ fontSize: 9, color: accent, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 3px" }}>ANNUAL · SAVE 20%</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: accent, margin: 0 }}>PKR {annualBill.toLocaleString("en-PK")}</p>
                  </div>
                </div>
                {annual && (
                  <div style={{ borderRadius: 8, background: dark ? "rgba(22,163,74,0.15)" : C.greenSoft, border: "1px solid rgba(22,163,74,0.25)", padding: "8px 12px", textAlign: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>You save PKR {annualSave.toLocaleString("en-PK")} every year</span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* CTA */}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <a
          href="#contact"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "14px 0",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
            background: dark ? accent : "transparent",
            color: dark ? "#0A1628" : C.ink,
            border: dark ? "none" : `1.5px solid ${C.borderMed}`,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            if (dark) { e.currentTarget.style.opacity = "0.88"; }
            else { e.currentTarget.style.borderColor = C.teal; e.currentTarget.style.color = C.teal; }
          }}
          onMouseLeave={(e) => {
            if (dark) { e.currentTarget.style.opacity = "1"; }
            else { e.currentTarget.style.borderColor = C.borderMed; e.currentTarget.style.color = C.ink; }
          }}
        >
          {tier.cta} <ArrowRight style={{ width: 14, height: 14 }} />
        </a>
        <p style={{ fontSize: 11, textAlign: "center", color: txtDim, paddingTop: 14, borderTop: `1px solid ${bdr}`, margin: 0 }}>
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
    <div className={dm.className} style={{ minHeight: "100vh", background: C.white, color: C.ink }}>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: C.tealSoft, border: `1px solid ${C.tealBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Building2 style={{ width: 16, height: 16, color: C.teal }} />
            </div>
            <span style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em" }}>Pulse</span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/" style={{ fontSize: 14, color: C.inkMid, textDecoration: "none", fontWeight: 500 }}>← Home</Link>
            <Link href="/login" style={{ fontSize: 14, color: C.inkMid, textDecoration: "none", fontWeight: 500 }}>Log in</Link>
            <Link href="/register" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, padding: "8px 18px", borderRadius: 9, background: C.teal, color: C.white, textDecoration: "none" }}>
              Sign up free <ArrowRight style={{ width: 13, height: 13 }} />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "72px 24px 48px", textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 14px", borderRadius: 20, border: `1px solid ${C.tealBorder}`, background: C.tealSoft, marginBottom: 24 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.teal, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: "0.12em" }}>ROLLING OUT IN PAKISTAN</span>
        </div>
        <h1 style={{ fontSize: "clamp(32px,4vw,52px)", fontWeight: 700, letterSpacing: "-0.035em", color: C.ink, lineHeight: 1.1, margin: "0 0 16px" }}>
          Simple pricing.<br />
          <span style={{ color: C.teal }}>No surprises.</span>
        </h1>
        {/* Monthly / Annual toggle */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 4, borderRadius: 12, border: `1px solid ${C.border}`, background: C.bgSoft }}>
          <button
            onClick={() => setAnnual(false)}
            style={{ padding: "8px 20px", borderRadius: 9, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", background: !annual ? C.teal : "transparent", color: !annual ? C.white : C.inkMid, transition: "all 0.15s" }}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", borderRadius: 9, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", background: annual ? C.teal : "transparent", color: annual ? C.white : C.inkMid, transition: "all 0.15s" }}
          >
            Annual
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: annual ? "rgba(255,255,255,0.2)" : C.tealSoft, color: annual ? C.white : C.teal }}>
              Save 20%
            </span>
          </button>
        </div>
      </section>

      {/* Tier cards */}
      <section style={{ padding: "0 24px 64px", maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, alignItems: "stretch", paddingTop: 24, paddingBottom: 24 }}>
          {TIERS.map((tier) => (
            <TierCard key={tier.name} tier={tier} annual={annual} applyDiscount={applyDiscount} />
          ))}
        </div>
        <p style={{ textAlign: "center", fontSize: 13, color: C.inkLight, marginTop: 20 }}>
          Prices in PKR · Pay less per flat as your society grows.
        </p>
      </section>

      {/* Feature manifest */}
      <section style={{ padding: "0 24px 64px", maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ borderRadius: 20, border: `1px solid ${C.border}`, overflow: "hidden", background: C.white }}>
          <div style={{ padding: "32px 40px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap", background: C.bgSoft }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: "0.12em", margin: "0 0 8px" }}>WHAT&apos;S INCLUDED</p>
              <h3 style={{ fontSize: 24, fontWeight: 700, color: C.ink, letterSpacing: "-0.02em", margin: "0 0 6px" }}>Every plan. Every feature.</h3>
              <p style={{ fontSize: 14, color: C.inkMid, margin: 0, lineHeight: 1.6 }}>Tier choice is purely about flat count — the product is identical across all plans.</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, letterSpacing: "0.1em", margin: "0 0 4px" }}>FEATURES</p>
              <p style={{ fontSize: 40, fontWeight: 700, color: C.teal, letterSpacing: "-0.03em", margin: 0, lineHeight: 1 }}>10</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {ALL_FEATURES.map((f, i) => (
              <div
                key={f}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px 32px",
                  borderBottom: i < ALL_FEATURES.length - (ALL_FEATURES.length % 2 === 0 ? 2 : 1) ? `1px solid ${C.border}` : "none",
                  borderRight: i % 2 === 0 ? `1px solid ${C.border}` : "none",
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, minWidth: 22, fontVariantNumeric: "tabular-nums" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontSize: 14, color: C.ink, flex: 1, lineHeight: 1.5 }}>{f}</span>
                <Check style={{ width: 15, height: 15, color: C.teal, flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Inquiry form */}
      <section id="contact" style={{ padding: "0 24px 96px", maxWidth: 720, margin: "0 auto", "--primary": "174 78% 26%", "--primary-foreground": "0 0% 100%" } as React.CSSProperties}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 14px", borderRadius: 20, border: `1px solid ${C.tealBorder}`, background: C.tealSoft, marginBottom: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.teal, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: "0.12em" }}>FREE DEMO</span>
          </div>
          <h2 style={{ fontSize: "clamp(24px,3vw,36px)", fontWeight: 700, letterSpacing: "-0.03em", color: C.ink, margin: "0 0 12px" }}>Request a free demo</h2>
          <p style={{ fontSize: 16, color: C.inkMid, margin: 0 }}>Fill in your details — we&apos;ll set up your building in under 24 hours.</p>
        </div>
        <InquiryForm />
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "28px 24px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: C.tealSoft, border: `1px solid ${C.tealBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Building2 style={{ width: 13, height: 13, color: C.teal }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Pulse</span>
          </Link>
          <p style={{ fontSize: 12, color: C.inkLight, margin: 0 }}>© 2026 Pulse. Built for buildings that mean business.</p>
          <Link href="/login" style={{ fontSize: 13, color: C.inkMid, textDecoration: "none", fontWeight: 500 }}>Sign in →</Link>
        </div>
      </footer>
    </div>
  );
}
