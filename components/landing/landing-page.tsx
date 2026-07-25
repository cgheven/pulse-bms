"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { DM_Sans } from "next/font/google";
import {
  Building2, ArrowRight, Receipt, Eye, Layers, Check,
  BarChart3, Users, Wallet, UserCog, Megaphone, Home,
  Vote, Shield, TrendingUp, ChevronRight,
  MessageCircleX, FileSpreadsheet, ShieldAlert,
} from "lucide-react";

const dm = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// ─── Design tokens — professional light mode ──────────────────────────────────
// Source: UI Pro Max skill → Real Estate/Property palette + Trust & Authority style
const C = {
  // Backgrounds
  white:       "#FFFFFF",
  bgSoft:      "#F8FAFC",       // section alternating
  bgHero:      "#F0FDFA",       // hero — barely-visible teal tint
  bgSidebar:   "#1E293B",       // dark sidebar in dashboard mockup
  // Primary — deep teal (skill: "Trust teal + professional blue" for real estate)
  teal:        "#0F766E",
  tealMed:     "#0D9488",
  tealSoft:    "rgba(15,118,110,0.08)",
  tealBorder:  "rgba(15,118,110,0.16)",
  tealHover:   "#0B6962",
  // Text
  ink:         "#0F172A",       // slate-900
  inkMid:      "#475569",       // slate-600
  inkLight:    "#94A3B8",       // slate-400
  // Borders
  border:      "#E2E8F0",       // slate-200
  borderMed:   "#CBD5E1",       // slate-300
  // Semantic
  green:       "#16A34A",
  greenSoft:   "rgba(22,163,74,0.08)",
  orange:      "#D97706",
  orangeSoft:  "rgba(217,119,6,0.08)",
  red:         "#DC2626",
  redSoft:     "rgba(220,38,38,0.08)",
  yellow:      "#D97706",
};

// ─── Scroll-reveal ────────────────────────────────────────────────────────────
function FadeUp({
  children,
  delay = 0,
  className = "",
  style: extraStyle,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } },
      { threshold: 0.1 }
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
        transform: v ? "translateY(0)" : "translateY(18px)",
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
        ...extraStyle,
      }}
    >
      {children}
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.14em",
        color: C.teal,
        marginBottom: 14,
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 18,
          height: 2,
          background: C.teal,
          borderRadius: 2,
          flexShrink: 0,
        }}
      />
      {children}
    </p>
  );
}

// ─── Floating notification ────────────────────────────────────────────────────
function FloatNotif({
  delay,
  msg,
  sub,
}: {
  delay: number;
  msg: string;
  sub: string;
}) {
  const [v, setV] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setV(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: -14,
        zIndex: 20,
        opacity: v ? 1 : 0,
        transform: v ? "translateY(0)" : "translateY(-6px)",
        transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderRadius: 12,
          background: C.white,
          border: `1px solid ${C.border}`,
          boxShadow: "0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)",
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: C.greenSoft,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="13" height="13" fill="none" viewBox="0 0 13 13">
            <path
              d="M1.5 6.5L4.5 9.5L11 3"
              stroke={C.green}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: C.ink, margin: 0 }}>
            {msg}
          </p>
          <p style={{ fontSize: 11, color: C.inkMid, margin: "2px 0 0" }}>
            {sub}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard mockup — matches the real Pulse BMS app ───────────────────────
// Dark theme, amber accent, section-grouped sidebar, large metric cards
const APP = {
  bg:       "#141418",
  sidebar:  "#0E0E12",
  card:     "#1C1C24",
  border:   "rgba(255,255,255,0.07)",
  amber:    "#F59E0B",
  text:     "#FFFFFF",
  textMid:  "rgba(255,255,255,0.45)",
  textDim:  "rgba(255,255,255,0.25)",
  green:    "#4ade80",
  red:      "#f87171",
};

function DashboardMockup() {
  return (
    <div className="relative w-full" style={{ perspective: "1100px" }}>
      {/* Glow beneath */}
      <div style={{ position: "absolute", bottom: -20, left: "8%", right: "8%", height: 36, background: "rgba(0,0,0,0.22)", filter: "blur(28px)", borderRadius: "50%", pointerEvents: "none" }} />

      {/* Window */}
      <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 4px 8px rgba(0,0,0,0.08), 0 20px 60px rgba(0,0,0,0.22), 0 40px 80px rgba(0,0,0,0.14)", transform: "perspective(1100px) rotateY(-5deg) rotateX(2deg)", transformOrigin: "0% 50%" }}>

        {/* Browser chrome */}
        <div style={{ height: 36, background: "#09090C", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 6, padding: "0 14px" }}>
          {["#FF5F57","#FEBC2E","#28C840"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.7 }} />)}
          <div style={{ flex: 1, maxWidth: 220, margin: "0 auto", background: "rgba(255,255,255,0.04)", borderRadius: 6, height: 22, border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", paddingLeft: 8 }}>
            <span style={{ fontSize: 10, color: APP.textDim, fontFamily: "monospace" }}>building.yourpulse.io</span>
          </div>
        </div>

        {/* App shell */}
        <div style={{ display: "flex", background: APP.bg }}>

          {/* ── Sidebar ── */}
          <div style={{ width: 188, background: APP.sidebar, borderRight: `1px solid ${APP.border}`, display: "flex", flexDirection: "column", padding: "14px 8px", flexShrink: 0, minHeight: 440 }}>

            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", marginBottom: 18 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: APP.amber, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Building2 style={{ width: 14, height: 14, color: "#0D0A00" }} />
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: APP.text, margin: 0, lineHeight: 1.2 }}>Pulse</p>
                <p style={{ fontSize: 7, color: APP.textDim, margin: 0, letterSpacing: "0.06em" }}>PULSE OF YOUR BUILDING</p>
              </div>
            </div>

            {/* OVERVIEW */}
            <p style={{ fontSize: 9, fontWeight: 700, color: APP.textDim, letterSpacing: "0.1em", padding: "0 8px", margin: "0 0 4px" }}>OVERVIEW</p>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", borderRadius: 7, background: "rgba(245,158,11,0.14)", marginBottom: 10 }}>
              <BarChart3 style={{ width: 12, height: 12, color: APP.amber, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: APP.amber, fontWeight: 600 }}>Dashboard</span>
            </div>

            {/* BUILDING */}
            <p style={{ fontSize: 9, fontWeight: 700, color: APP.textDim, letterSpacing: "0.1em", padding: "0 8px", margin: "0 0 4px" }}>BUILDING</p>
            {[
              { Icon: Home,     label: "Flats" },
              { Icon: Users,    label: "Residents" },
              { Icon: Wallet,   label: "Vehicles" },
              { Icon: Layers,   label: "Import / Export" },
            ].map(({ Icon, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", marginBottom: 1 }}>
                <Icon style={{ width: 11, height: 11, color: APP.textDim, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: APP.textMid }}>{label}</span>
              </div>
            ))}

            {/* FINANCE */}
            <p style={{ fontSize: 9, fontWeight: 700, color: APP.textDim, letterSpacing: "0.1em", padding: "0 8px", margin: "8px 0 4px" }}>FINANCE</p>
            {[
              { Icon: Receipt,   label: "Maintenance" },
              { Icon: TrendingUp,label: "Other Income" },
              { Icon: Megaphone, label: "Expenses" },
              { Icon: Shield,    label: "Reports" },
            ].map(({ Icon, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", marginBottom: 1 }}>
                <Icon style={{ width: 11, height: 11, color: APP.textDim, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: APP.textMid }}>{label}</span>
              </div>
            ))}

            {/* PEOPLE */}
            <p style={{ fontSize: 9, fontWeight: 700, color: APP.textDim, letterSpacing: "0.1em", padding: "0 8px", margin: "8px 0 4px" }}>PEOPLE</p>
            {[
              { Icon: UserCog, label: "Staff" },
              { Icon: Vote,    label: "Union" },
            ].map(({ Icon, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", marginBottom: 1 }}>
                <Icon style={{ width: 11, height: 11, color: APP.textDim, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: APP.textMid }}>{label}</span>
              </div>
            ))}

            {/* Bottom status */}
            <div style={{ marginTop: "auto", paddingTop: 10, borderTop: `1px solid ${APP.border}`, display: "flex", alignItems: "center", gap: 6, padding: "10px 8px 0" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: APP.textDim }}>Pulse is online</span>
            </div>
          </div>

          {/* ── Main content ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Top bar */}
            <div style={{ height: 46, background: APP.sidebar, borderBottom: `1px solid ${APP.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", flexShrink: 0 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: APP.text, margin: 0 }}>Dashboard</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: APP.textMid }}>Sunrise Apartments</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: APP.amber, color: "#0D0A00" }}>ADMIN</span>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: `1px solid ${APP.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: APP.text }}>BA</div>
              </div>
            </div>

            {/* Dashboard cards grid */}
            <div style={{ flex: 1, padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, overflowY: "hidden" }}>

              {/* Cash available */}
              <div style={{ background: APP.card, border: `1px solid ${APP.border}`, borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ fontSize: 9, fontWeight: 600, color: APP.textDim, margin: "0 0 10px", letterSpacing: "0.08em" }}>CASH AVAILABLE →</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: APP.text, margin: "0 0 4px", letterSpacing: "-0.02em" }}>Rs. 6,39,200</p>
                <p style={{ fontSize: 11, color: APP.textMid, margin: 0 }}>Total cash held</p>
              </div>

              {/* Maintenance collection */}
              <div style={{ background: APP.card, border: `1px solid ${APP.border}`, borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ fontSize: 9, fontWeight: 600, color: APP.textDim, margin: "0 0 10px", letterSpacing: "0.08em" }}>MAINTENANCE COLLECTION →</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: APP.green, margin: "0 0 4px", letterSpacing: "-0.02em" }}>Rs. 20,500</p>
                <p style={{ fontSize: 11, color: APP.textMid, margin: 0 }}>6 of 11 paid</p>
              </div>

              {/* Paid this month */}
              <div style={{ background: APP.card, border: `1px solid ${APP.border}`, borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ fontSize: 9, fontWeight: 600, color: APP.textDim, margin: "0 0 10px", letterSpacing: "0.08em" }}>PAID THIS MONTH →</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: APP.green, margin: "0 0 4px", letterSpacing: "-0.02em" }}>6 flats</p>
                <p style={{ fontSize: 11, color: APP.textMid, margin: 0 }}>A-101 · A-102 · A-301 · B-102 +2 more</p>
              </div>

              {/* Expenses */}
              <div style={{ background: APP.card, border: `1px solid ${APP.border}`, borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ fontSize: 9, fontWeight: 600, color: APP.textDim, margin: "0 0 10px", letterSpacing: "0.08em" }}>EXPENSES →</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: APP.red, margin: "0 0 4px", letterSpacing: "-0.02em" }}>Rs. 50,000</p>
                <p style={{ fontSize: 11, color: APP.textMid, margin: 0 }}>Operations Rs. 50,000 · Salary Rs. 0</p>
              </div>

              {/* Remaining — full width */}
              <div style={{ background: APP.card, border: `1px solid ${APP.border}`, borderRadius: 10, padding: "14px 16px", gridColumn: "span 2" }}>
                <p style={{ fontSize: 9, fontWeight: 600, color: APP.textDim, margin: "0 0 10px", letterSpacing: "0.08em" }}>REMAINING · JULY 2026 →</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: APP.red, margin: "0 0 4px", letterSpacing: "-0.02em" }}>–Rs. 25,000</p>
                <p style={{ fontSize: 11, color: APP.textMid, margin: 0 }}>Deficit · spending more than collecting</p>
              </div>

              {/* Defaulters */}
              <div style={{ background: APP.card, border: `1px solid ${APP.border}`, borderLeft: `3px solid ${APP.green}`, borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ fontSize: 9, fontWeight: 600, color: APP.textDim, margin: "0 0 10px", letterSpacing: "0.08em" }}>DEFAULTERS · 3+ MONTHS →</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: APP.green, margin: "0 0 4px", letterSpacing: "-0.02em" }}>None</p>
                <p style={{ fontSize: 11, color: APP.textMid, margin: 0 }}>No long-term arrears</p>
              </div>

              {/* Complaints */}
              <div style={{ background: APP.card, border: `1px solid ${APP.border}`, borderLeft: `3px solid ${APP.green}`, borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ fontSize: 9, fontWeight: 600, color: APP.textDim, margin: "0 0 10px", letterSpacing: "0.08em" }}>COMPLAINTS →</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: APP.green, margin: "0 0 4px", letterSpacing: "-0.02em" }}>Clear</p>
                <p style={{ fontSize: 11, color: APP.textMid, margin: 0 }}>No issues reported</p>
              </div>

            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({
  children,
  className = "",
  style: extraStyle,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      className={className}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: C.white,
        border: `1px solid ${hov ? C.borderMed : C.border}`,
        borderRadius: 16,
        overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s, transform 0.2s",
        boxShadow: hov
          ? "0 8px 32px rgba(0,0,0,0.08)"
          : "0 1px 4px rgba(0,0,0,0.04)",
        transform: hov ? "translateY(-2px)" : "translateY(0)",
        ...extraStyle,
      }}
    >
      {children}
    </div>
  );
}

// ─── Main landing page ────────────────────────────────────────────────────────
export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <div
      className={`${dm.className} min-h-screen overflow-x-hidden`}
      style={{ background: C.white, color: C.ink }}
    >
      <style>{`
        html { scroll-behavior: smooth; }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0);   }
        }
        @keyframes pulseDot {
          0%,100% { transform:scale(1); opacity:0.7; }
          50%      { transform:scale(1.3); opacity:1; }
        }
        @media (prefers-reduced-motion:reduce) {
          * { animation:none !important; transition-duration:0.01ms !important; }
        }
        /* ── Responsive grids ── */
        .hero-grid { display:grid; grid-template-columns:1fr; gap:40px; align-items:start; width:100%; max-width:1120px; margin:0 auto; padding:48px 20px; position:relative; }
        @media (min-width:1024px) { .hero-grid { grid-template-columns:1fr 1fr; gap:56px; align-items:center; padding:60px 24px; } }
        .hero-mockup { display:none; }
        @media (min-width:1024px) { .hero-mockup { display:block; } }
        .features-grid { display:grid; grid-template-columns:1fr; }
        @media (min-width:640px) { .features-grid { grid-template-columns:1fr 1fr; } }
        @media (min-width:1024px) { .features-grid { grid-template-columns:repeat(3,1fr); } }
        .feature-item { padding:28px 24px; border-bottom:1px solid #E2E8F0; }
        .feature-item:last-child { border-bottom:none; }
        @media (min-width:640px) and (max-width:1023px) { .feature-item:nth-child(odd) { border-right:1px solid #E2E8F0; } .feature-item:nth-last-child(-n+2) { border-bottom:none; } }
        @media (min-width:1024px) { .feature-item { padding:36px 32px; border-right:1px solid #E2E8F0; border-bottom:1px solid #E2E8F0; } .feature-item:nth-child(3n) { border-right:none; } .feature-item:nth-last-child(-n+3) { border-bottom:none; } }
        .marketplace-grid { display:grid; grid-template-columns:1fr; gap:48px; align-items:center; }
        @media (min-width:1024px) { .marketplace-grid { grid-template-columns:1fr 1fr; gap:80px; } }
        .roles-grid { display:grid; grid-template-columns:1fr; gap:16px; }
        @media (min-width:640px) { .roles-grid { grid-template-columns:1fr 1fr; } }
        @media (min-width:1024px) { .roles-grid { grid-template-columns:repeat(4,1fr); } }
      `}</style>

      {/* ─── Navigation ──────────────────────────────────────────────────── */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          height: 60,
          display: "flex",
          alignItems: "center",
          background: scrolled ? "rgba(255,255,255,0.92)" : C.white,
          backdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: `1px solid ${scrolled ? C.border : "transparent"}`,
          transition: "background 0.3s, border-color 0.3s, backdrop-filter 0.3s",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 1120,
            margin: "0 auto",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo */}
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: C.tealSoft,
                border: `1px solid ${C.tealBorder}`,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image src="/logo.jpeg" alt="Pulse BMS" width={30} height={30} style={{ width: "100%", height: "100%", objectFit: "cover" }} priority />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: "-0.02em" }}>
              Pulse BMS
            </span>
          </Link>

          {/* Nav links */}
          <div style={{ gap: 28, alignItems: "center" }} className="hidden md:flex">
            {[["#features", "Features"], ["#why", "Why Pulse"], ["/pricing", "Pricing"]].map(([href, label]) => (
              <a
                key={href}
                href={href}
                style={{
                  fontSize: 14,
                  color: C.inkMid,
                  textDecoration: "none",
                  fontWeight: 500,
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.ink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.inkMid)}
              >
                {label}
              </a>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link
              href="/login"
              style={{
                fontSize: 14,
                color: C.inkMid,
                textDecoration: "none",
                fontWeight: 500,
                transition: "color 0.15s",
              }}
              className="hidden sm:block"
              onMouseEnter={(e) => (e.currentTarget.style.color = C.ink)}
              onMouseLeave={(e) => (e.currentTarget.style.color = C.inkMid)}
            >
              Log in
            </Link>
            <Link
              href="/register"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 700,
                padding: "8px 18px",
                borderRadius: 9,
                background: C.teal,
                color: C.white,
                textDecoration: "none",
                transition: "background 0.15s, box-shadow 0.15s",
                boxShadow: "0 1px 3px rgba(15,118,110,0.3)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = C.tealHover;
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(15,118,110,0.35)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = C.teal;
                e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,118,110,0.3)";
              }}
            >
              Sign up free <ArrowRight style={{ width: 13, height: 13 }} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero — split layout ─────────────────────────────────────────── */}
      <section
        style={{
          paddingTop: 80,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          position: "relative",
          overflow: "hidden",
          background: `linear-gradient(160deg, ${C.bgHero} 0%, ${C.white} 55%)`,
        }}
      >
        {/* Subtle grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage: `linear-gradient(${C.border} 1px, transparent 1px), linear-gradient(90deg, ${C.border} 1px, transparent 1px)`,
            backgroundSize: "52px 52px",
            opacity: 0.35,
            maskImage: "linear-gradient(to bottom, black, transparent 70%)",
          }}
        />

        <div className="hero-grid">
          {/* Left — copy */}
          <div>
            {/* Badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "5px 12px 5px 8px",
                borderRadius: 100,
                background: C.tealSoft,
                border: `1px solid ${C.tealBorder}`,
                marginBottom: 24,
                animation: "fadeUp 0.5s ease 0.1s both",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: C.teal,
                  flexShrink: 0,
                  animation: "pulseDot 2.5s ease infinite",
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.teal }}>
                Pakistan&apos;s building management platform
              </span>
            </div>

            {/* Headline */}
            <h1
              style={{
                fontSize: "clamp(36px, 4.2vw, 56px)",
                fontWeight: 700,
                letterSpacing: "-0.035em",
                lineHeight: 1.08,
                color: C.ink,
                margin: "0 0 20px",
                animation: "fadeUp 0.6s ease 0.2s both",
              }}
            >
              Your building runs
              <br />
              <span style={{ color: C.teal }}>on WhatsApp. It shouldn&apos;t.</span>
            </h1>

            {/* Subheadline */}
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.7,
                color: C.inkMid,
                margin: "0 0 32px",
                maxWidth: 430,
                animation: "fadeUp 0.6s ease 0.3s both",
              }}
            >
              WhatsApp and Excel were never meant to run a building. Pulse automates billing, tracks every rupee, and keeps residents informed — built for Pakistan.
            </p>

            {/* CTAs */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 40,
                animation: "fadeUp 0.6s ease 0.4s both",
              }}
            >
              <Link
                href="/register"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 15,
                  fontWeight: 700,
                  padding: "12px 24px",
                  borderRadius: 10,
                  background: C.teal,
                  color: C.white,
                  textDecoration: "none",
                  boxShadow: "0 2px 8px rgba(15,118,110,0.25)",
                  transition: "background 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = C.tealHover;
                  e.currentTarget.style.boxShadow = "0 6px 20px rgba(15,118,110,0.30)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = C.teal;
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(15,118,110,0.25)";
                }}
              >
                Sign up free <ArrowRight style={{ width: 15, height: 15 }} />
              </Link>
              <a
                href="#features"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 15,
                  fontWeight: 600,
                  padding: "12px 22px",
                  borderRadius: 10,
                  background: C.white,
                  border: `1.5px solid ${C.border}`,
                  color: C.inkMid,
                  textDecoration: "none",
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = C.borderMed;
                  e.currentTarget.style.color = C.ink;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.color = C.inkMid;
                }}
              >
                See how it works <ChevronRight style={{ width: 14, height: 14 }} />
              </a>
            </div>

          </div>

          {/* Right — dashboard (hidden below lg to avoid illegible tiny mockup) */}
          <div style={{ animation: "fadeUp 0.7s ease 0.35s both" }} className="hero-mockup">
            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────────────────── */}
      <section
        id="features"
        style={{ padding: "96px 24px", background: C.bgSoft }}
      >
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <FadeUp className="text-center" style={{ marginBottom: 56 }}>
            <Label>What&apos;s included</Label>
            <h2
              style={{
                fontSize: "clamp(26px,3.5vw,42px)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: C.ink,
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              The whole building
              <br />in one tab.
            </h2>
          </FadeUp>

          {/* Feature grid — icon + title + one line */}
          <div className="features-grid">
            {[
              {
                Icon: Receipt,
                color: C.teal,
                bg: C.tealSoft,
                border: C.tealBorder,
                title: "Maintenance Billing",
                line: "Generate invoices for every flat in one click — no WhatsApp needed.",
              },
              {
                Icon: Eye,
                color: "#0369A1",
                bg: "rgba(3,105,161,0.07)",
                border: "rgba(3,105,161,0.14)",
                title: "Financial Transparency",
                line: "Every resident sees every rupee — income, expenses, and bank balance.",
              },
              {
                Icon: UserCog,
                color: C.green,
                bg: C.greenSoft,
                border: "rgba(22,163,74,0.15)",
                title: "Staff Management",
                line: "Attendance, payroll, and roles — chowkidars to lift operators.",
              },
              {
                Icon: Vote,
                color: C.orange,
                bg: "rgba(217,119,6,0.07)",
                border: "rgba(217,119,6,0.14)",
                title: "Union Governance",
                line: "Proposals, digital voting, and meeting minutes — without the chaos.",
              },
              {
                Icon: Home,
                color: "#7C3AED",
                bg: "rgba(124,58,237,0.07)",
                border: "rgba(124,58,237,0.14)",
                title: "Resident Portal",
                line: "Dues, complaints, notices — residents self-serve, admins stay free.",
              },
              {
                Icon: Layers,
                color: C.teal,
                bg: C.tealSoft,
                border: C.tealBorder,
                title: "Quick Onboarding",
                line: "Import your existing Excel data and go live in under 15 minutes.",
              },
            ].map(({ Icon, color, bg, border, title, line }, i) => (
              <FadeUp key={title} delay={i * 40}>
                <div className="feature-item">
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: bg,
                      border: `1px solid ${border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 20,
                    }}
                  >
                    <Icon style={{ width: 20, height: 20, color }} />
                  </div>
                  <h3
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: C.ink,
                      margin: "0 0 8px",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {title}
                  </h3>
                  <p style={{ fontSize: 14, color: C.inkMid, lineHeight: 1.6, margin: 0 }}>
                    {line}
                  </p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Marketplace ─────────────────────────────────────────────────── */}
      <section style={{ padding: "96px 24px", background: C.white }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }} className="marketplace-grid">

          {/* Left — copy */}
          <FadeUp>
            <Label>Built-in marketplace</Label>
            <h2 style={{ fontSize: "clamp(26px,3.5vw,42px)", fontWeight: 700, letterSpacing: "-0.03em", color: C.ink, lineHeight: 1.15, margin: "0 0 20px" }}>
              Your building.<br />
              <span style={{ color: C.teal }}>Your marketplace.</span>
            </h2>
            <p style={{ fontSize: 17, color: C.inkMid, lineHeight: 1.7, margin: "0 0 36px", maxWidth: 420 }}>
              Two ways residents earn — list a flat for rent or sale, or offer a service to neighbours. No middlemen. No commissions. Just neighbours helping neighbours.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { Icon: Home,    color: C.teal,   bg: C.tealSoft,  border: C.tealBorder,               title: "Flat listings",     desc: "Rent or sell your flat directly — no agents, no commissions." },
                { Icon: Users,   color: "#7C3AED", bg: "rgba(124,58,237,0.07)", border: "rgba(124,58,237,0.14)", title: "Local services",    desc: "Offer tutoring, cooking, repairs, and more to your neighbours." },
                { Icon: TrendingUp, color: C.green, bg: C.greenSoft, border: "rgba(22,163,74,0.15)",   title: "Public discovery",  desc: "Listings go live on Pulse's public directory — visible to all." },
              ].map(({ Icon, color, bg, border, title, desc }) => (
                <div key={title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, border: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon style={{ width: 16, height: 16, color }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: "0 0 3px" }}>{title}</p>
                    <p style={{ fontSize: 13, color: C.inkMid, margin: 0, lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </FadeUp>

          {/* Right — mockup cards */}
          <FadeUp delay={100}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Flat listing card */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: C.tealSoft, color: C.teal, border: `1px solid ${C.tealBorder}` }}>FOR RENT</span>
                    <p style={{ fontSize: 20, fontWeight: 700, color: C.ink, margin: "10px 0 2px", letterSpacing: "-0.02em" }}>Rs. 35,000 <span style={{ fontSize: 13, fontWeight: 400, color: C.inkMid }}>/month</span></p>
                    <p style={{ fontSize: 13, color: C.inkMid, margin: 0 }}>Flat A-301 · Sunrise Apartments</p>
                  </div>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: C.bgSoft, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Home style={{ width: 18, height: 18, color: C.inkLight }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {["3 Bed", "2 Bath", "Furnished", "Parking"].map(tag => (
                    <span key={tag} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: C.bgSoft, border: `1px solid ${C.border}`, color: C.inkMid }}>{tag}</span>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 12, color: C.inkLight }}>Listed via Pulse · Karachi</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.teal }}>Contact owner →</span>
                </div>
              </div>

              {/* Services card */}
              <div style={{ background: C.bgSoft, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: C.inkLight, letterSpacing: "0.1em", margin: "0 0 12px" }}>NEIGHBOUR SERVICES</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Laptop & Phone Repair", flat: "C-204", price: "Rs. 500/visit",  color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
                    { label: "Home Tutor — Maths",    flat: "A-105", price: "Rs. 800/hr",     color: C.orange,  bg: C.orangeSoft },
                    { label: "Home Cooked Meals",      flat: "B-302", price: "Rs. 1,200/day",  color: C.green,   bg: C.greenSoft },
                  ].map(({ label, flat, price, color, bg }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: C.ink, margin: 0 }}>{label}</p>
                          <p style={{ fontSize: 11, color: C.inkLight, margin: 0 }}>Flat {flat}</p>
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: bg, color }}>{price}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p style={{ fontSize: 12, color: C.inkLight, textAlign: "center", margin: 0 }}>
                Visible at{" "}
                <span style={{ color: C.teal, fontWeight: 600 }}>yourpulse.io/find</span>
              </p>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ─── Roles ───────────────────────────────────────────────────────── */}
      <section id="why" style={{ padding: "96px 24px", background: C.white }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <FadeUp className="text-center" style={{ marginBottom: 56 }}>
            <Label>Built for every role</Label>
            <h2
              style={{
                fontSize: "clamp(26px,3.5vw,42px)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: C.ink,
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              Four roles. One platform.
            </h2>
          </FadeUp>

          <div className="roles-grid">
            {[
              { Icon: Shield,    role: "Admin",       color: C.teal,    bg: C.tealSoft,                 border: C.tealBorder,                      perks: ["Manage flats & residents","Generate & collect invoices","Track staff & payroll","Full audit log"] },
              { Icon: Vote,      role: "Union",       color: C.orange,  bg: "rgba(217,119,6,0.07)",     border: "rgba(217,119,6,0.14)",             perks: ["Create & vote on proposals","Schedule meetings","Approve expenses","Post building notices"] },
              { Icon: Home,      role: "Resident",    color: "#0369A1", bg: "rgba(3,105,161,0.07)",     border: "rgba(3,105,161,0.14)",             perks: ["View own dues & receipts","See full building finances","Log complaints","Vote on proposals"] },
              { Icon: Shield,    role: "Guard",       color: C.green,   bg: C.greenSoft,                border: "rgba(22,163,74,0.15)",             perks: ["Search & verify resident vehicles","Scan & verify visitor passes","View tonight's expected visitors","Digital — no paper register"] },
            ].map(({ Icon, role, color, bg, border, perks }, i) => (
              <FadeUp key={role} delay={i * 60}>
                <div
                  style={{
                    padding: 24,
                    borderRadius: 16,
                    background: C.white,
                    border: `1px solid ${C.border}`,
                    height: "100%",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                    cursor: "default",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = border;
                    e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = C.border;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: bg,
                      border: `1px solid ${border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 14,
                    }}
                  >
                    <Icon style={{ width: 20, height: 20, color }} />
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: "0.1em", margin: "0 0 12px", textTransform: "uppercase" }}>
                    {role}
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {perks.map((p) => (
                      <li key={p} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: C.inkMid }}>
                        <Check style={{ width: 14, height: 14, color, flexShrink: 0, marginTop: 1 }} />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </FadeUp>
            ))}
          </div>

        </div>
      </section>


      {/* ─── CTA ─────────────────────────────────────────────────────────── */}
      <section style={{ padding: "96px 24px", background: C.white }}>
        <FadeUp style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <Label>Get started</Label>
          <h2
            style={{
              fontSize: "clamp(26px,3.5vw,44px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: C.ink,
              lineHeight: 1.1,
              margin: "0 0 16px",
            }}
          >
            Be among the first to do this properly.
          </h2>
          <p style={{ fontSize: 16, color: C.inkMid, lineHeight: 1.7, margin: "0 0 36px" }}>
            Pulse is free to start. Upload your building data with our Excel template and you&apos;re up and running in under 15 minutes — no WhatsApp required.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/register"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 15,
                fontWeight: 700,
                padding: "13px 28px",
                borderRadius: 11,
                background: C.teal,
                color: C.white,
                textDecoration: "none",
                boxShadow: "0 2px 10px rgba(15,118,110,0.28)",
                transition: "background 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.tealHover; e.currentTarget.style.boxShadow = "0 6px 24px rgba(15,118,110,0.35)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = C.teal; e.currentTarget.style.boxShadow = "0 2px 10px rgba(15,118,110,0.28)"; }}
            >
              Sign up free <ArrowRight style={{ width: 16, height: 16 }} />
            </Link>
            <a
              href="https://wa.me/923336673553?text=Hi%2C%20I%20came%20across%20Pulse%20BMS%20and%20I%27d%20like%20to%20learn%20more%20about%20managing%20my%20building%20with%20it."
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 15,
                fontWeight: 600,
                padding: "13px 24px",
                borderRadius: 11,
                background: "transparent",
                border: "1.5px solid #25D366",
                color: "#25D366",
                textDecoration: "none",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#25D366"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#25D366"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Talk to the team
            </a>
          </div>
          <p style={{ marginTop: 20, fontSize: 12, color: C.inkLight }}>
            No credit card required · Free onboarding support · Karachi-based team
          </p>
        </FadeUp>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer
        style={{
          padding: "20px 24px",
          borderTop: `1px solid ${C.border}`,
          background: C.bgSoft,
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                background: C.tealSoft,
                border: `1px solid ${C.tealBorder}`,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image src="/logo.jpeg" alt="Pulse BMS" width={24} height={24} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.inkMid }}>Pulse BMS</span>
            <span style={{ fontSize: 12, color: C.inkLight, marginLeft: 4 }}>© 2025</span>
          </div>

          <div style={{ display: "flex", gap: 24 }}>
            {["Pricing", "Privacy", "Terms"].map((l) => (
              <a
                key={l}
                href="#"
                style={{ fontSize: 13, color: C.inkLight, textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.inkMid)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.inkLight)}
              >
                {l}
              </a>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: C.green,
                animation: "pulseDot 2.5s ease infinite",
              }}
            />
            <span style={{ fontSize: 12, color: C.inkLight }}>Built in Pakistan</span>
          </div>
        </div>
      </footer>

      {/* ─── Floating WhatsApp button ─────────────────────────────────── */}
      <FloatingWhatsApp />
    </div>
  );
}

function FloatingWhatsApp() {
  const [hov, setHov] = useState(false);
  return (
    <a
      href="https://wa.me/923336673553?text=Hi%2C%20I%20came%20across%20Pulse%20BMS%20and%20I%27d%20like%20to%20learn%20more%20about%20managing%20my%20building%20with%20it."
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "fixed",
        bottom: 28,
        right: 28,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: hov ? "12px 20px 12px 14px" : "14px",
        borderRadius: 100,
        background: "#25D366",
        color: "#fff",
        textDecoration: "none",
        boxShadow: hov
          ? "0 8px 32px rgba(37,211,102,0.45)"
          : "0 4px 20px rgba(37,211,102,0.35)",
        transition: "padding 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s, transform 0.2s",
        transform: hov ? "scale(1.04)" : "scale(1)",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
      aria-label="Chat with us on WhatsApp"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ flexShrink: 0 }}
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          maxWidth: hov ? 100 : 0,
          opacity: hov ? 1 : 0,
          transition: "max-width 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.2s",
          overflow: "hidden",
        }}
      >
        Chat with us
      </span>
    </a>
  );
}
