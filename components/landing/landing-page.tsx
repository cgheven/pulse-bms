"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import {
  ArrowRight, Check, ChevronRight, Receipt, Wallet, Users, UserCog,
  Vote, Shield, Home, FileSpreadsheet, BarChart3, Car, Megaphone,
  MinusCircle, PlusCircle,
} from "lucide-react";
import { landingFaqs } from "./faqs";

// ─── Typography — the PulseHub brand system ──────────────────────────────────
// Fraunces (serif display) + IBM Plex Sans (body) + IBM Plex Mono (eyebrows).
// Shared with the flagship marketing site so every Pulse surface reads as one
// family. Loaded locally here so the landing page keeps its own type without
// disturbing the dark admin app (which uses DM Sans).
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-fraunces",
});
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex-sans",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

const SERIF = "var(--font-fraunces), ui-serif, Georgia, serif";
const MONO = "var(--font-plex-mono), ui-monospace, SFMono-Regular, monospace";

// ─── Palette — ported from the PulseHub design tokens (oklch) ─────────────────
// Warm paper background, burnt-orange primary, dark "ink" panels with a gold
// accent. Modern browsers render oklch natively; kept inline so the landing
// stays isolated from the app's dark theme tokens.
const C = {
  bg:            "oklch(0.985 0.006 75)",   // warm paper
  bgCard:        "#FFFFFF",
  muted:         "oklch(0.965 0.004 75)",   // faint warm surface
  fg:            "oklch(0.20 0.012 60)",     // near-black warm ink
  fgSoft:        "oklch(0.44 0.012 70)",     // body / muted text
  fgFaint:       "oklch(0.60 0.012 75)",     // captions
  border:        "oklch(0.90 0.008 70)",
  borderStrong:  "oklch(0.84 0.010 70)",
  primary:       "oklch(0.54 0.167 45)",     // terracotta
  primaryHover:  "oklch(0.49 0.165 45)",
  primarySoft:   "oklch(0.54 0.167 45 / 0.08)",
  primaryBorder: "oklch(0.54 0.167 45 / 0.20)",
  // Dark "ink" panels
  ink:           "oklch(0.19 0.012 65)",
  inkText:       "oklch(0.97 0.005 75)",
  inkMuted:      "oklch(0.72 0.02 75)",
  inkAccent:     "oklch(0.80 0.15 68)",      // warm gold on dark
  inkBorder:     "oklch(1 0 0 / 0.12)",
  // Semantic (used sparingly in mock chips)
  green:         "oklch(0.65 0.16 150)",
};

// Product screenshots — real app, in intrinsic pixel size.
const SHOTS = {
  dashboard:   { src: "/screenshots/dashboard.png",     w: 3024, h: 1586 },
  maintenance: { src: "/screenshots/maintenance.png",   w: 3024, h: 1584 },
  residents:   { src: "/screenshots/residents.png",     w: 3018, h: 1644 },
  bills:       { src: "/screenshots/bills-expenses.png", w: 3024, h: 1638 },
  vehicles:    { src: "/screenshots/vehicles.png",      w: 3022, h: 1450 },
};

// ─── Scroll reveal ────────────────────────────────────────────────────────────
function Reveal({
  children, delay = 0, className = "", style,
}: {
  children: React.ReactNode; delay?: number; className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: v ? 1 : 0,
        transform: v ? "translateY(0)" : "translateY(22px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Mono eyebrow ─────────────────────────────────────────────────────────────
function Eyebrow({ children, onDark = false }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <p style={{
      fontFamily: MONO,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: "0.2em",
      color: onDark ? C.inkAccent : C.primary,
      margin: 0,
    }}>
      {children}
    </p>
  );
}

// ─── Framed product screenshot (device-less browser chrome) ──────────────────
function ProductShot({
  src, w, h, label, alt, priority = false, sizes = "(max-width: 1023px) calc(100vw - 2rem), 760px",
}: {
  src: string; w: number; h: number; label: string; alt: string; priority?: boolean; sizes?: string;
}) {
  return (
    <div style={{
      width: "100%",
      maxWidth: "100%",
      overflow: "hidden",
      borderRadius: 16,
      border: `1px solid ${C.border}`,
      background: C.bgCard,
      boxShadow: "0 28px 70px -28px rgba(40,30,20,0.32)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 7,
        padding: "9px 14px",
        borderBottom: `1px solid ${C.border}`,
        background: C.muted,
      }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "oklch(0.78 0.02 70)" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "oklch(0.78 0.02 70)" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "oklch(0.78 0.02 70)" }} />
        <span style={{
          marginLeft: 8, fontFamily: MONO, fontSize: 11, textTransform: "uppercase",
          letterSpacing: "0.08em", color: C.fgFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {label}
        </span>
      </div>
      <Image
        src={src}
        alt={alt}
        width={w}
        height={h}
        priority={priority}
        sizes={sizes}
        style={{ display: "block", width: "100%", height: "auto" }}
      />
    </div>
  );
}

// ─── Primary / ghost buttons ──────────────────────────────────────────────────
function PrimaryBtn({ href, children, large = false }: { href: string; children: React.ReactNode; large?: boolean }) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        fontSize: large ? 15 : 14, fontWeight: 600,
        padding: large ? "13px 24px" : "9px 18px",
        borderRadius: 11,
        background: C.primary, color: "#fff", textDecoration: "none",
        boxShadow: "0 1px 2px oklch(0.54 0.167 45 / 0.35)",
        transition: "background 0.15s, box-shadow 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.primaryHover; e.currentTarget.style.boxShadow = "0 6px 20px oklch(0.54 0.167 45 / 0.30)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = C.primary; e.currentTarget.style.boxShadow = "0 1px 2px oklch(0.54 0.167 45 / 0.35)"; }}
    >
      {children}
    </Link>
  );
}

function GhostBtn({ href, children, large = false }: { href: string; children: React.ReactNode; large?: boolean }) {
  return (
    <a
      href={href}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        fontSize: large ? 15 : 14, fontWeight: 600,
        padding: large ? "13px 22px" : "9px 16px",
        borderRadius: 11,
        background: "transparent",
        border: `1px solid ${C.primaryBorder}`,
        color: C.primary, textDecoration: "none",
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.primarySoft; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </a>
  );
}

// ─── Landing page ─────────────────────────────────────────────────────────────
export function LandingPage({ appHref = null }: { appHref?: string | null }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <div
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
      style={{
        background: C.bg,
        color: C.fg,
        fontFamily: "var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif",
        minHeight: "100vh",
        overflowX: "clip",
      }}
    >
      <style>{`
        html { scroll-behavior: smooth; }
        @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } * { transition-duration: 0.01ms !important; } }
        .wrap { width: 100%; max-width: 1200px; margin: 0 auto; padding-left: 20px; padding-right: 20px; }
        @media (min-width: 640px) { .wrap { padding-left: 24px; padding-right: 24px; } }
        .hero-grid { display: grid; grid-template-columns: 1fr; gap: 40px; align-items: center; }
        @media (min-width: 1024px) { .hero-grid { grid-template-columns: 1fr 1.25fr; gap: 56px; } }
        .show-grid { display: grid; grid-template-columns: 1fr; gap: 32px; align-items: center; }
        @media (min-width: 900px) { .show-grid { grid-template-columns: 1fr 1.2fr; gap: 56px; } .show-grid.flip .show-copy { order: 2; } }
        .feat-grid { display: grid; grid-template-columns: 1fr; gap: 1px; background: ${C.border}; border: 1px solid ${C.border}; border-radius: 18px; overflow: hidden; }
        @media (min-width: 640px) { .feat-grid { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 1024px) { .feat-grid { grid-template-columns: repeat(3, 1fr); } }
        .roles-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media (min-width: 640px) { .roles-grid { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 1024px) { .roles-grid { grid-template-columns: repeat(4, 1fr); } }
        .nav-links { display: none; }
        @media (min-width: 880px) { .nav-links { display: flex; } }
        .login-link { display: none; }
        @media (min-width: 520px) { .login-link { display: inline-flex; } }
      `}</style>

      {/* ─── Navigation ─────────────────────────────────────────────── */}
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
            <Image src="/logo.jpeg" alt="Pulse BMS" width={38} height={38} priority
              style={{ width: 38, height: 38, borderRadius: 11, objectFit: "cover" }} />
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.fg, letterSpacing: "-0.01em" }}>Pulse BMS</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 500, letterSpacing: "0.14em", color: C.primary }}>
                BUILDING MANAGEMENT
              </span>
            </span>
          </Link>

          <div className="nav-links" style={{ gap: 30, alignItems: "center" }}>
            {[["#tour", "Product"], ["#features", "Features"], ["#roles", "Roles"], ["/pricing", "Pricing"], ["#faq", "FAQ"]].map(([href, label]) => (
              <a key={href} href={href}
                style={{ fontSize: 14, fontWeight: 500, color: C.fgSoft, textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.fg)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.fgSoft)}
              >{label}</a>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {appHref ? (
              <PrimaryBtn href={appHref}>Go to dashboard <ArrowRight style={{ width: 14, height: 14 }} /></PrimaryBtn>
            ) : (
              <>
                <Link href="/login" className="login-link"
                  style={{ fontSize: 14, fontWeight: 500, color: C.fgSoft, textDecoration: "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = C.fg)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = C.fgSoft)}
                >Log in</Link>
                <PrimaryBtn href="/register">Start free trial <ArrowRight style={{ width: 14, height: 14 }} /></PrimaryBtn>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ─── Hero ───────────────────────────────────────────────────── */}
      <section style={{ paddingTop: 104, paddingBottom: 56, position: "relative", overflow: "hidden" }}>
        {/* soft warm wash behind the mock */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(900px 440px at 78% 8%, ${C.primarySoft}, transparent 70%)`,
        }} />
        <div className="wrap hero-grid" style={{ position: "relative" }}>
          <div style={{ maxWidth: 520 }}>
            <div style={{ animation: "none", marginBottom: 18 }}>
              <Eyebrow>Building management software · Pakistan</Eyebrow>
            </div>
            <h1 style={{
              fontFamily: SERIF, fontWeight: 500,
              fontSize: "clamp(2.4rem, 5.4vw, 4rem)", lineHeight: 1.04, letterSpacing: "-0.02em",
              color: C.fg, margin: "0 0 20px",
            }}>
              Every flat, resident and <span style={{ color: C.primary }}>rupee</span>, in one place.
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.7, color: C.fgSoft, margin: "0 0 30px", maxWidth: 460 }}>
              Pulse BMS brings maintenance billing, payments, residents, staff, expenses and
              building finances into one platform — built for apartment buildings and societies
              across Pakistan.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
              <PrimaryBtn href="/register" large>Start free trial <ArrowRight style={{ width: 16, height: 16 }} /></PrimaryBtn>
              <GhostBtn href="#tour" large>See it in action <ChevronRight style={{ width: 15, height: 15 }} /></GhostBtn>
            </div>
            <p style={{ fontFamily: MONO, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: C.fgFaint, margin: 0 }}>
              Free to start · No card required · Live in 15 minutes
            </p>
          </div>

          <Reveal delay={120}>
            <ProductShot
              src={SHOTS.dashboard.src} w={SHOTS.dashboard.w} h={SHOTS.dashboard.h}
              label="building.yourpulse.io — Dashboard"
              alt="Pulse BMS admin dashboard showing cash available, maintenance collection, expenses and a revenue versus expenses chart"
              priority sizes="(max-width: 1023px) calc(100vw - 2rem), 680px"
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", marginTop: 16, justifyContent: "center" }}>
              {["Collections", "Expenses", "Defaulters", "Bills", "Reports"].map((t) => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.fgFaint }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary, opacity: 0.6 }} />{t}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── "One platform" ink section ─────────────────────────────── */}
      <section id="tour" style={{ padding: "28px 0 8px" }}>
        <div className="wrap">
          <Reveal style={{
            borderRadius: 24, background: C.ink, color: C.inkText,
            padding: "clamp(28px, 5vw, 56px)", overflow: "hidden",
          }}>
            <div style={{ maxWidth: 680 }}>
              <Eyebrow onDark>01 · One platform</Eyebrow>
              <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(1.8rem, 4vw, 2.9rem)", lineHeight: 1.08, letterSpacing: "-0.02em", margin: "16px 0 14px" }}>
                Everything your building needs, in one login.
              </h2>
              <p style={{ fontSize: 16.5, lineHeight: 1.7, color: C.inkMuted, margin: 0 }}>
                Stop stitching the building together across WhatsApp groups, registers and Excel
                files. Every module talks to the next, so one entry updates everywhere.
              </p>
            </div>

            <ul style={{ listStyle: "none", padding: 0, margin: "36px 0 0", borderTop: `1px solid ${C.inkBorder}` }}>
              {[
                { n: "01", t: "Maintenance billing & collection", d: "Invoice every flat monthly, track paid, partial and overdue, send WhatsApp reminders." },
                { n: "02", t: "Payments & receipts", d: "Record payments, auto-generate receipts and keep a clean, searchable ledger." },
                { n: "03", t: "Residents, flats & vehicles", d: "Owners, tenants, CNIC, logins and registered cars — on file and up to date." },
                { n: "04", t: "Staff & payroll", d: "Attendance and salaries for chowkidars, lift operators and cleaning staff." },
                { n: "05", t: "Expenses, bills & finances", d: "Log every rupee out, split cash vs bank, and keep the building books honest." },
                { n: "06", t: "Union, notices & reports", d: "Proposals, voting, announcements and exportable reports for the committee." },
              ].map(({ n, t, d }) => (
                <li key={n} style={{ borderBottom: `1px solid ${C.inkBorder}`, display: "grid", gridTemplateColumns: "auto 1fr", gap: 18, padding: "18px 0" }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: C.inkAccent, paddingTop: 2 }}>{n}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 17, fontWeight: 600 }}>{t}</span>
                    <span style={{ display: "block", marginTop: 3, fontSize: 14.5, lineHeight: 1.6, color: C.inkMuted }}>{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ─── Feature showcases (real screenshots) ───────────────────── */}
      <section id="features" style={{ padding: "72px 0 24px" }}>
        <div className="wrap" style={{ display: "flex", flexDirection: "column", gap: 80 }}>

          <Showcase
            eyebrow="Maintenance"
            title="Collect maintenance without chasing."
            body="Generate a bill for every flat in one click, then watch collections land. Pulse shows exactly who has paid, who is partial and who is overdue — and sends a WhatsApp reminder with a tap."
            points={["One-click monthly billing for all flats", "Paid / partial / unpaid at a glance", "WhatsApp reminders & instant receipts", "Export the full ledger to PDF or Excel"]}
            shot={SHOTS.maintenance} label="Maintenance" alt="Pulse BMS maintenance page listing each flat with totals, received amounts and reminder actions"
          />

          <Showcase
            flip
            eyebrow="Residents"
            title="Every owner and tenant on file."
            body="A clean directory of who lives where — owners and tenants, CNIC, phone and move-in date. Give residents their own login so they self-serve dues, receipts and complaints."
            points={["Owners & tenants per flat", "Search by name, flat, phone or CNIC", "Give residents their own portal login", "Roles, status and full audit trail"]}
            shot={SHOTS.residents} label="Residents" alt="Pulse BMS residents directory showing names, flats, roles, phone numbers and CNIC"
          />

          <Showcase
            eyebrow="Finances"
            title="Know where every rupee goes."
            body="Log expenses and utility bills, track cash and bank separately, and show residents the real numbers. No more arguments about the building's money — the books are open."
            points={["Expenses, utility bills & other income", "Cash vs bank balances kept straight", "Transparent finances for every resident", "Month-by-month reporting & exports"]}
            shot={SHOTS.bills} label="Bills & Expenses" alt="Pulse BMS bills and expenses page tracking building spending and balances"
          />
        </div>
      </section>

      {/* ─── Feature grid (modules) ─────────────────────────────────── */}
      <section style={{ padding: "48px 0" }}>
        <div className="wrap">
          <Reveal style={{ textAlign: "center", marginBottom: 40 }}>
            <Eyebrow>What&apos;s included</Eyebrow>
            <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(1.7rem, 3.6vw, 2.7rem)", lineHeight: 1.1, letterSpacing: "-0.02em", color: C.fg, margin: "14px 0 0" }}>
              The whole building, one tab.
            </h2>
          </Reveal>
          <div className="feat-grid">
            {[
              { Icon: Receipt, t: "Maintenance billing", d: "Monthly invoices for every flat — no WhatsApp needed." },
              { Icon: Wallet, t: "Payments & receipts", d: "Record payments and issue receipts in seconds." },
              { Icon: Users, t: "Residents & flats", d: "Owners, tenants, CNIC and logins, all on file." },
              { Icon: UserCog, t: "Staff & payroll", d: "Attendance and salaries, chowkidars to lift operators." },
              { Icon: Megaphone, t: "Expenses & bills", d: "Track every rupee out, cash and bank kept straight." },
              { Icon: Vote, t: "Union & voting", d: "Proposals, digital votes and meeting minutes." },
              { Icon: Car, t: "Vehicles & guard", d: "Registered cars and visitor passes, verified at the gate." },
              { Icon: BarChart3, t: "Reports & exports", d: "Finances and dues to PDF or Excel, any month." },
              { Icon: Home, t: "Resident portal", d: "Dues, receipts and complaints — residents self-serve." },
            ].map(({ Icon, t, d }, i) => (
              <Reveal key={t} delay={(i % 3) * 50}>
                <div style={{ background: C.bgCard, padding: "26px 24px", height: "100%" }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: C.primarySoft, border: `1px solid ${C.primaryBorder}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                    <Icon style={{ width: 19, height: 19, color: C.primary }} />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: C.fg, margin: "0 0 6px" }}>{t}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: C.fgSoft, margin: 0 }}>{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Roles ──────────────────────────────────────────────────── */}
      <section id="roles" style={{ padding: "56px 0" }}>
        <div className="wrap">
          <Reveal style={{ textAlign: "center", marginBottom: 40 }}>
            <Eyebrow>Built for every role</Eyebrow>
            <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(1.7rem, 3.6vw, 2.7rem)", lineHeight: 1.1, letterSpacing: "-0.02em", color: C.fg, margin: "14px 0 0" }}>
              Four roles. One platform.
            </h2>
          </Reveal>
          <div className="roles-grid">
            {[
              { Icon: Shield, role: "Admin", perks: ["Manage flats & residents", "Generate & collect invoices", "Track staff & payroll", "Full audit log"] },
              { Icon: Vote, role: "Union", perks: ["Create & vote on proposals", "Schedule meetings", "Approve expenses", "Post building notices"] },
              { Icon: Home, role: "Resident", perks: ["View own dues & receipts", "See full building finances", "Log complaints", "Vote on proposals"] },
              { Icon: UserCog, role: "Guard", perks: ["Verify resident vehicles", "Scan visitor passes", "See expected visitors", "Digital — no paper register"] },
            ].map(({ Icon, role, perks }, i) => (
              <Reveal key={role} delay={i * 60}>
                <div style={{ height: "100%", padding: 24, borderRadius: 16, background: C.bgCard, border: `1px solid ${C.border}`, transition: "border-color 0.2s, box-shadow 0.2s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.primaryBorder; e.currentTarget.style.boxShadow = "0 10px 30px -14px rgba(40,30,20,0.25)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: C.primarySoft, border: `1px solid ${C.primaryBorder}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                    <Icon style={{ width: 20, height: 20, color: C.primary }} />
                  </div>
                  <p style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: C.primary, margin: "0 0 12px" }}>{role}</p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {perks.map((p) => (
                      <li key={p} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, color: C.fgSoft }}>
                        <Check style={{ width: 14, height: 14, color: C.primary, flexShrink: 0, marginTop: 2 }} />{p}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Marketplace band ───────────────────────────────────────── */}
      <section style={{ padding: "24px 0 56px" }}>
        <div className="wrap">
          <Reveal style={{ borderRadius: 20, border: `1px solid ${C.border}`, background: C.bgCard, padding: "clamp(24px,4vw,44px)", display: "grid", gap: 24 }}>
            <div style={{ maxWidth: 620 }}>
              <Eyebrow>Built-in marketplace</Eyebrow>
              <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(1.5rem, 3vw, 2.2rem)", lineHeight: 1.12, letterSpacing: "-0.02em", color: C.fg, margin: "14px 0 10px" }}>
                Your building. Your marketplace.
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.7, color: C.fgSoft, margin: 0 }}>
                Residents list a flat for rent or sale, or offer a service to neighbours — live on
                Pulse&apos;s public directory. No middlemen, no commissions.
              </p>
            </div>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {[
                { Icon: Home, t: "Flat listings", d: "Rent or sell directly — no agents, no commission." },
                { Icon: Users, t: "Local services", d: "Tutoring, repairs, home cooking, offered to neighbours." },
                { Icon: FileSpreadsheet, t: "Public discovery", d: "Listings go live on the Pulse directory for everyone." },
              ].map(({ Icon, t, d }) => (
                <div key={t} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: C.primarySoft, border: `1px solid ${C.primaryBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon style={{ width: 16, height: 16, color: C.primary }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.fg, margin: "0 0 2px" }}>{t}</p>
                    <p style={{ fontSize: 13, color: C.fgSoft, margin: 0, lineHeight: 1.55 }}>{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── FAQ ────────────────────────────────────────────────────── */}
      <section id="faq" style={{ padding: "48px 0 64px" }}>
        <div className="wrap" style={{ maxWidth: 820 }}>
          <Reveal style={{ textAlign: "center", marginBottom: 36 }}>
            <Eyebrow>Questions</Eyebrow>
            <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(1.7rem, 3.6vw, 2.6rem)", lineHeight: 1.1, letterSpacing: "-0.02em", color: C.fg, margin: "14px 0 0" }}>
              Everything you might ask.
            </h2>
          </Reveal>
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            {landingFaqs.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
          </div>
        </div>
      </section>

      {/* ─── CTA band ───────────────────────────────────────────────── */}
      <section style={{ padding: "0 0 72px" }}>
        <div className="wrap">
          <Reveal style={{ borderRadius: 24, background: C.ink, color: C.inkText, padding: "clamp(32px, 5vw, 64px)", textAlign: "center" }}>
            <Eyebrow onDark>Get started</Eyebrow>
            <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(1.9rem, 4vw, 3rem)", lineHeight: 1.08, letterSpacing: "-0.02em", margin: "16px auto 14px", maxWidth: 640 }}>
              Bring your whole building into one platform.
            </h2>
            <p style={{ fontSize: 16.5, lineHeight: 1.7, color: C.inkMuted, margin: "0 auto 30px", maxWidth: 560 }}>
              Free to start, no card required. Import your flats and residents from Excel and go
              live in under 15 minutes — our Karachi-based team helps you set up.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <PrimaryBtn href="/register" large>Start free trial <ArrowRight style={{ width: 16, height: 16 }} /></PrimaryBtn>
              <a
                href="https://wa.me/923327857333?text=Hi%2C%20I%20came%20across%20Pulse%20BMS%20and%20I%27d%20like%20to%20learn%20more%20about%20managing%20my%20building%20with%20it."
                target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, padding: "13px 22px", borderRadius: 11, border: "1px solid #25D366", color: "#25D366", textDecoration: "none", transition: "background 0.15s, color 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#25D366"; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#25D366"; }}
              >
                <WaIcon /> Talk to the team
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, background: C.muted }}>
        <div className="wrap" style={{ paddingTop: 48, paddingBottom: 32 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 32, marginBottom: 32 }}>
            <div style={{ maxWidth: 360 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <Image src="/logo.jpeg" alt="Pulse BMS" width={34} height={34} style={{ width: 34, height: 34, borderRadius: 10, objectFit: "cover" }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: C.fg }}>Pulse BMS</span>
              </div>
              <p style={{ fontSize: 14.5, lineHeight: 1.65, color: C.fgSoft, margin: "0 0 14px" }}>
                One platform for apartment buildings and societies: maintenance, payments,
                residents, staff and finances — built for Pakistan.
              </p>
              <p style={{ fontFamily: MONO, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: C.fgFaint, margin: 0 }}>
                Part of the Pulse suite
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "28px 48px", paddingBottom: 28, borderBottom: `1px solid ${C.border}` }}>
            <FootCol title="Product" links={[["#features", "Features"], ["/pricing", "Pricing"], ["#tour", "Product tour"], ["#faq", "FAQ"]]} />
            <FootCol title="Account" links={[["/login", "Log in"], ["/register", "Start free trial"]]} />
            <FootCol title="More from Pulse" links={[
              ["https://www.yourpulse.io", "PulseHub"],
              ["https://gym.yourpulse.io", "Gym Management"],
              ["https://clinic.yourpulse.io", "Clinic Management"],
              ["https://inventory.yourpulse.io", "Inventory Management"],
            ]} external />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, paddingTop: 20 }}>
            <p style={{ fontSize: 13, color: C.fgFaint, margin: 0 }}>© {new Date().getFullYear()} Pulse BMS. All rights reserved.</p>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: C.fgFaint }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green }} /> Built in Pakistan
            </span>
          </div>
        </div>
      </footer>

      <FloatingWhatsApp />
    </div>
  );
}

// ─── Showcase row (text + framed screenshot) ──────────────────────────────────
function Showcase({
  eyebrow, title, body, points, shot, label, alt, flip = false,
}: {
  eyebrow: string; title: string; body: string; points: string[];
  shot: { src: string; w: number; h: number }; label: string; alt: string; flip?: boolean;
}) {
  return (
    <Reveal className={`show-grid${flip ? " flip" : ""}`}>
      <div className="show-copy" style={{ maxWidth: 460 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(1.5rem, 3vw, 2.2rem)", lineHeight: 1.12, letterSpacing: "-0.02em", color: C.fg, margin: "14px 0 14px" }}>
          {title}
        </h3>
        <p style={{ fontSize: 16, lineHeight: 1.7, color: C.fgSoft, margin: "0 0 20px" }}>{body}</p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 11 }}>
          {points.map((p) => (
            <li key={p} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14.5, color: C.fg }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, background: C.primarySoft, border: `1px solid ${C.primaryBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                <Check style={{ width: 12, height: 12, color: C.primary }} />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div style={{ minWidth: 0 }}>
        <ProductShot src={shot.src} w={shot.w} h={shot.h} label={label} alt={alt} />
      </div>
    </Reveal>
  );
}

// ─── FAQ item ─────────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "20px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
      >
        <span style={{ fontSize: 16.5, fontWeight: 600, color: C.fg }}>{q}</span>
        {open
          ? <MinusCircle style={{ width: 20, height: 20, color: C.primary, flexShrink: 0 }} />
          : <PlusCircle style={{ width: 20, height: 20, color: C.fgFaint, flexShrink: 0 }} />}
      </button>
      {open && (
        <p style={{ fontSize: 15, lineHeight: 1.7, color: C.fgSoft, margin: "0 4px", padding: "0 0 22px", maxWidth: 680 }}>{a}</p>
      )}
    </div>
  );
}

// ─── Footer column ────────────────────────────────────────────────────────────
function FootCol({ title, links, external = false }: { title: string; links: [string, string][]; external?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 600, color: C.fg, margin: "0 0 12px" }}>{title}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
        {links.map(([href, label]) => (
          <li key={href + label}>
            {external ? (
              <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: C.fgSoft, textDecoration: "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.primary)} onMouseLeave={(e) => (e.currentTarget.style.color = C.fgSoft)}>{label}</a>
            ) : (
              <Link href={href} style={{ fontSize: 14, color: C.fgSoft, textDecoration: "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.primary)} onMouseLeave={(e) => (e.currentTarget.style.color = C.fgSoft)}>{label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function FloatingWhatsApp() {
  const [hov, setHov] = useState(false);
  return (
    <a
      href="https://wa.me/923327857333?text=Hi%2C%20I%20came%20across%20Pulse%20BMS%20and%20I%27d%20like%20to%20learn%20more%20about%20managing%20my%20building%20with%20it."
      target="_blank" rel="noopener noreferrer"
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      aria-label="Chat with us on WhatsApp"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 100,
        display: "flex", alignItems: "center", gap: 10,
        padding: hov ? "12px 20px 12px 14px" : "14px",
        borderRadius: 100, background: "#25D366", color: "#fff", textDecoration: "none",
        boxShadow: hov ? "0 8px 32px rgba(37,211,102,0.45)" : "0 4px 20px rgba(37,211,102,0.35)",
        transition: "padding 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s, transform 0.2s",
        transform: hov ? "scale(1.04)" : "scale(1)", overflow: "hidden", whiteSpace: "nowrap",
      }}
    >
      <span style={{ display: "flex", flexShrink: 0 }}><WaIcon /></span>
      <span style={{ fontSize: 13, fontWeight: 700, maxWidth: hov ? 100 : 0, opacity: hov ? 1 : 0, transition: "max-width 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.2s", overflow: "hidden" }}>
        Chat with us
      </span>
    </a>
  );
}
