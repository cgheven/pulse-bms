"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { ArrowRight, Calculator, Check } from "lucide-react";
import { ContactForm } from "@/components/public/contact-form";

// ─── Typography — shared PulseHub brand system ───────────────────────────────
const display = Fraunces({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"], display: "swap", variable: "--font-fraunces" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-plex-mono" });
const SERIF = "var(--font-fraunces), ui-serif, Georgia, serif";
const MONO = "var(--font-plex-mono), ui-monospace, SFMono-Regular, monospace";

// ─── Palette — ported from the PulseHub design tokens (oklch) ─────────────────
const C = {
  bg:            "oklch(0.985 0.006 75)",
  bgCard:        "#FFFFFF",
  muted:         "oklch(0.965 0.004 75)",
  fg:            "oklch(0.20 0.012 60)",
  fgSoft:        "oklch(0.44 0.012 70)",
  fgFaint:       "oklch(0.60 0.012 75)",
  border:        "oklch(0.90 0.008 70)",
  borderStrong:  "oklch(0.84 0.010 70)",
  primary:       "oklch(0.54 0.167 45)",
  primaryHover:  "oklch(0.49 0.165 45)",
  primarySoft:   "oklch(0.54 0.167 45 / 0.08)",
  primaryBorder: "oklch(0.54 0.167 45 / 0.20)",
  ink:           "oklch(0.19 0.012 65)",
  inkText:       "oklch(0.97 0.005 75)",
  inkMuted:      "oklch(0.72 0.02 75)",
  inkFaint:      "oklch(0.58 0.02 75)",
  inkAccent:     "oklch(0.80 0.15 68)",
  inkBorder:     "oklch(1 0 0 / 0.12)",
  green:         "oklch(0.60 0.15 150)",
  greenSoft:     "oklch(0.60 0.15 150 / 0.12)",
};

// ─── One simple rate, per flat ───────────────────────────────────────────────
const PER_FLAT_MONTHLY = 50;        // PKR / flat / month
const PER_FLAT_ANNUAL = 480;        // PKR / flat / year  (vs 600 monthly → 20% off)
const ANNUAL_MONTHLY_EQUIV = Math.round(PER_FLAT_ANNUAL / 12); // 40 / flat / month
const SAVE_PER_FLAT_YEAR = PER_FLAT_MONTHLY * 12 - PER_FLAT_ANNUAL; // 120 / flat / year
const pkr = (n: number) => `PKR ${n.toLocaleString("en-PK")}`;

const ALL_FEATURES = [
  "One-tap WhatsApp reminders to defaulters",
  "Auto maintenance bills + printable receipts",
  "Accountant-grade reports",
  "Project funds — lift, paint, generator",
  "Utility tracking — K-Electric, SSGC, water, AMCs",
  "Union governance — proposals, voting, elections",
  "Resident portal — dues, payments, complaints",
  "Rent + sale listings — visibility for the union",
  "Services marketplace — neighbours offer + find help",
  "Multi-role access — admin, union, owner, resident",
];

// ─── Single-tier pricing + live calculator ───────────────────────────────────
function PricingCard({ annual }: { annual: boolean }) {
  const [flatsInput, setFlatsInput] = useState("");
  const flats = Math.max(0, Math.floor(Number(flatsInput) || 0));

  const rate = annual ? PER_FLAT_ANNUAL : PER_FLAT_MONTHLY;
  const unit = annual ? "flat / year" : "flat / month";

  const cycleTotal = flats * rate;                 // total for the selected cycle
  const yearlySave = flats * SAVE_PER_FLAT_YEAR;   // annual saving vs monthly

  return (
    <div
      style={{
        position: "relative", maxWidth: 560, margin: "0 auto",
        borderRadius: 24, background: C.bgCard, border: `1px solid ${C.border}`,
        boxShadow: "0 32px 80px -36px rgba(40,24,10,0.35)", overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: C.primary }} />

      <div style={{ padding: "clamp(28px, 5vw, 40px)" }}>
        {/* Rate */}
        <p style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.fgFaint, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 14px" }}>
          Per-flat pricing
        </p>
        <div style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
            <span style={{ fontSize: 16, color: C.fgSoft, paddingBottom: 12, fontWeight: 500 }}>PKR</span>
            <span style={{ fontFamily: SERIF, fontSize: "clamp(3.2rem, 9vw, 4.5rem)", fontWeight: 500, color: C.primary, letterSpacing: "-0.02em", lineHeight: 0.95, fontVariantNumeric: "tabular-nums" }}>
              {rate}
            </span>
            <span style={{ fontSize: 15, color: C.fgSoft, paddingBottom: 12, fontWeight: 500 }}>/ {unit}</span>
          </div>
          {annual && (
            <span style={{ marginBottom: 14, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: C.greenSoft, color: C.green, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Save 20%
            </span>
          )}
        </div>
        <p style={{ fontSize: 14.5, color: C.fgSoft, lineHeight: 1.6, margin: "10px 0 0" }}>
          {annual
            ? `Just ${pkr(ANNUAL_MONTHLY_EQUIV)} per flat each month, billed once a year.`
            : "One simple rate for every flat — switch to annual and save 20%."}
        </p>

        {/* Calculator */}
        <div style={{ marginTop: 26, borderRadius: 16, border: `1px solid ${C.primaryBorder}`, background: C.primarySoft, padding: 18 }}>
          <label htmlFor="flats" style={{ display: "block", fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.primary, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            How many flats in your building?
          </label>
          <div style={{ position: "relative" }}>
            <Calculator style={{ width: 16, height: 16, color: C.primary, position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              id="flats" type="number" inputMode="numeric" min={0}
              placeholder="e.g. 48"
              value={flatsInput}
              onChange={(e) => setFlatsInput(e.target.value)}
              style={{ width: "100%", height: 48, paddingLeft: 42, paddingRight: 14, borderRadius: 10, border: `1px solid ${C.borderStrong}`, background: C.bgCard, color: C.fg, fontSize: 16, fontWeight: 600, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
            />
          </div>

          {flats > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ borderRadius: 12, background: C.bgCard, border: `1px solid ${C.border}`, padding: "16px 18px", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 13.5, color: C.fgSoft }}>
                  {flats.toLocaleString("en-PK")} flats × {pkr(rate)}
                </span>
                <span style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600, color: C.fg, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {pkr(cycleTotal)}
                  <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 400, color: C.fgFaint }}> / {annual ? "yr" : "mo"}</span>
                </span>
              </div>
              <div style={{ marginTop: 8, borderRadius: 10, background: annual ? C.greenSoft : C.muted, border: `1px solid ${annual ? C.green : C.border}`, padding: "10px 14px", textAlign: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: annual ? C.green : C.fgSoft }}>
                  {annual
                    ? `You save ${pkr(yearlySave)} every year`
                    : `Pay yearly and save ${pkr(yearlySave)} a year`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Trust row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", marginTop: 20 }}>
          {["No minimums", "No hidden fees", "No tiers"].map((t) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: C.fgSoft }}>
              <Check style={{ width: 14, height: 14, color: C.primary }} /> {t}
            </span>
          ))}
        </div>

        {/* CTA */}
        <a
          href="#contact"
          style={{ marginTop: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "14px 0", borderRadius: 12, fontSize: 15, fontWeight: 600, textDecoration: "none", background: C.primary, color: "#fff", boxShadow: "0 2px 10px oklch(0.54 0.167 45 / 0.28)", transition: "background 0.15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.primaryHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = C.primary; }}
        >
          Get started <ArrowRight style={{ width: 16, height: 16 }} />
        </a>
        <p style={{ fontFamily: MONO, fontSize: 11, textAlign: "center", color: C.fgFaint, margin: "14px 0 0", letterSpacing: "0.04em" }}>
          Free to start · No card required · All 10 features included
        </p>
      </div>
    </div>
  );
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <div
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
      style={{ minHeight: "100vh", background: C.bg, color: C.fg, fontFamily: "var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif" }}
    >
      <style>{`
        .wrap { width:100%; max-width:1120px; margin:0 auto; padding-left:20px; padding-right:20px; }
        @media (min-width:640px){ .wrap { padding-left:24px; padding-right:24px; } }
        .features-manifest { display:grid; grid-template-columns:1fr; }
        @media (min-width:640px){ .features-manifest { grid-template-columns:1fr 1fr; } }
        .feature-header { padding:24px 20px; }
        @media (min-width:640px){ .feature-header { padding:30px 36px; } }
        .feature-row { display:flex; align-items:center; gap:14px; padding:14px 20px; border-bottom:1px solid ${"oklch(0.90 0.008 70)"}; }
        .feature-row:last-child { border-bottom:none; }
        @media (min-width:640px){ .feature-row { padding:15px 32px; } .feature-row:nth-child(odd){ border-right:1px solid ${"oklch(0.90 0.008 70)"}; } .feature-row:nth-last-child(-n+2){ border-bottom:none; } }
        .nav-links { display:none; }
        @media (min-width:880px){ .nav-links { display:flex; } }
        .login-link { display:none; }
        @media (min-width:520px){ .login-link { display:inline-flex; } }
      `}</style>

      {/* Nav — matches the landing page nav */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, height: 62,
        display: "flex", alignItems: "center",
        background: scrolled ? "color-mix(in oklch, " + C.bg + " 88%, transparent)" : C.bg,
        backdropFilter: scrolled ? "blur(14px)" : "none",
        borderBottom: `1px solid ${scrolled ? C.border : "transparent"}`,
        transition: "background 0.3s, border-color 0.3s",
      }}>
        <div className="wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <Image src="/logo.jpeg" alt="Pulse BMS" width={38} height={38} priority style={{ width: 38, height: 38, borderRadius: 11, objectFit: "cover" }} />
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.fg, letterSpacing: "-0.01em" }}>Pulse BMS</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 500, letterSpacing: "0.14em", color: C.primary }}>BUILDING MANAGEMENT</span>
            </span>
          </Link>

          <div className="nav-links" style={{ gap: 30, alignItems: "center" }}>
            {[["/#tour", "Product"], ["/#features", "Features"], ["/#roles", "Roles"], ["/pricing", "Pricing"], ["/#faq", "FAQ"]].map(([href, label]) => (
              <Link key={href} href={href}
                style={{ fontSize: 14, fontWeight: 500, color: href === "/pricing" ? C.fg : C.fgSoft, textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.fg)}
                onMouseLeave={(e) => (e.currentTarget.style.color = href === "/pricing" ? C.fg : C.fgSoft)}
              >{label}</Link>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/login" className="login-link"
              style={{ fontSize: 14, fontWeight: 500, color: C.fgSoft, textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = C.fg)}
              onMouseLeave={(e) => (e.currentTarget.style.color = C.fgSoft)}
            >Log in</Link>
            <Link href="/register"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, padding: "9px 18px", borderRadius: 11, background: C.primary, color: "#fff", textDecoration: "none", boxShadow: "0 1px 2px oklch(0.54 0.167 45 / 0.35)", transition: "background 0.15s, box-shadow 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.primaryHover; e.currentTarget.style.boxShadow = "0 4px 12px oklch(0.54 0.167 45 / 0.30)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = C.primary; e.currentTarget.style.boxShadow = "0 1px 2px oklch(0.54 0.167 45 / 0.35)"; }}
            >
              Start free trial <ArrowRight style={{ width: 14, height: 14 }} />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "76px 0 36px", textAlign: "center" }}>
        <div className="wrap" style={{ maxWidth: 720 }}>
          <p style={{ fontFamily: MONO, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.primary, margin: "0 0 18px" }}>
            Pricing · Pakistan
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: "clamp(2.2rem, 5vw, 3.6rem)", fontWeight: 500, letterSpacing: "-0.02em", color: C.fg, lineHeight: 1.06, margin: "0 0 14px" }}>
            One rate per flat. <span style={{ color: C.primary }}>Nothing hidden.</span>
          </h1>
          <p style={{ fontSize: 16.5, lineHeight: 1.7, color: C.fgSoft, margin: "0 auto 26px", maxWidth: 520 }}>
            Pay a simple price for each flat in your building — every feature included. No tiers,
            no minimums, no setup fees.
          </p>
          {/* Monthly / Annual toggle */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 4, borderRadius: 12, border: `1px solid ${C.border}`, background: C.muted }}>
            <button
              onClick={() => setAnnual(false)}
              style={{ padding: "8px 20px", borderRadius: 9, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit", background: !annual ? C.primary : "transparent", color: !annual ? "#fff" : C.fgSoft, transition: "all 0.15s" }}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", borderRadius: 9, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit", background: annual ? C.primary : "transparent", color: annual ? "#fff" : C.fgSoft, transition: "all 0.15s" }}
            >
              Annual
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: annual ? "rgba(255,255,255,0.22)" : C.primarySoft, color: annual ? "#fff" : C.primary }}>
                Save 20%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Single pricing card */}
      <section style={{ padding: "0 0 56px" }}>
        <div className="wrap">
          <PricingCard annual={annual} />
        </div>
      </section>

      {/* Feature manifest */}
      <section style={{ padding: "0 0 56px" }}>
        <div className="wrap" style={{ maxWidth: 1000 }}>
          <div style={{ borderRadius: 20, border: `1px solid ${C.border}`, overflow: "hidden", background: C.bgCard }}>
            <div className="feature-header" style={{ borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap", background: C.muted }}>
              <div>
                <p style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.primary, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 10px" }}>What&apos;s included</p>
                <h3 style={{ fontFamily: SERIF, fontSize: "clamp(1.4rem, 2.6vw, 1.9rem)", fontWeight: 500, color: C.fg, letterSpacing: "-0.02em", margin: "0 0 6px" }}>One price. Every feature.</h3>
                <p style={{ fontSize: 14, color: C.fgSoft, margin: 0, lineHeight: 1.6 }}>Everything below is included for every building — no add-ons, no upgrades to unlock.</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.fgFaint, letterSpacing: "0.1em", margin: "0 0 4px" }}>FEATURES</p>
                <p style={{ fontFamily: SERIF, fontSize: 44, fontWeight: 500, color: C.primary, letterSpacing: "-0.02em", margin: 0, lineHeight: 1 }}>10</p>
              </div>
            </div>

            <div className="features-manifest">
              {ALL_FEATURES.map((f, i) => (
                <div key={f} className="feature-row">
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.fgFaint, minWidth: 22, fontVariantNumeric: "tabular-nums" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ fontSize: 14, color: C.fg, flex: 1, lineHeight: 1.5 }}>{f}</span>
                  <Check style={{ width: 15, height: 15, color: C.primary, flexShrink: 0 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact form */}
      <section id="contact" style={{ padding: "0 0 88px" }}>
        <div className="wrap" style={{ maxWidth: 640 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <p style={{ fontFamily: MONO, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.primary, margin: "0 0 14px" }}>Contact us</p>
            <h2 style={{ fontFamily: SERIF, fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 500, letterSpacing: "-0.02em", color: C.fg, margin: "0 0 12px" }}>Have a question? Get in touch.</h2>
            <p style={{ fontSize: 16, color: C.fgSoft, margin: "0 auto", maxWidth: 460, lineHeight: 1.6 }}>
              Ready to start? <Link href="/register" style={{ color: C.primary, fontWeight: 600, textDecoration: "none" }}>Sign up free</Link> — or send us a message and we&apos;ll get back to you.
            </p>
          </div>
          <ContactForm />
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.border}`, background: C.muted, padding: "28px 0" }}>
        <div className="wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
            <Image src="/logo.jpeg" alt="Pulse BMS" width={28} height={28} style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: C.fg }}>Pulse BMS</span>
          </Link>
          <p style={{ fontSize: 13, color: C.fgFaint, margin: 0 }}>© {new Date().getFullYear()} Pulse BMS · Part of the Pulse suite</p>
          <Link href="/login" style={{ fontSize: 13, color: C.fgSoft, textDecoration: "none", fontWeight: 500 }}>Sign in →</Link>
        </div>
      </footer>
    </div>
  );
}
