"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  Check,
  FileText,
  MessageSquare,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Vote,
  Wallet,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────
 * Constants
 *   — Base tier prices in PKR/mo (per building).
 *   — Annual save 20% — same toggle pattern as GMS.
 *   — Multi-building tiers: 2 / 5 / 10. Pricing benchmarked so per-building
 *     cost drops as you scale, mirroring the GMS multi-branch pattern.
 *   — Sales WhatsApp: 923332994029 (canonical Pakistani int'l form, no plus).
 * ───────────────────────────────────────────────────────────────────────── */

const BASE_PRICES = { starter: 5000, growth: 15000, pro: 20000 } as const;
const ANNUAL_DISCOUNT = 0.2;
const SALES_WA = "923332994029";

function waLink(text: string) {
  return `https://wa.me/${SALES_WA}?text=${encodeURIComponent(text)}`;
}

const tiers = [
  {
    key: "starter" as const,
    name: "Starter",
    tagline: "For small buildings ready to ditch WhatsApp groups + Excel.",
    highlight: false,
    cta: "Get Started",
    href: "/login",
    bullets: [
      "Up to 50 flats",
      "Maintenance invoices auto-generated every month",
      "Payment tracking",
      "Resident portal — dues, payments, notices in one tap",
      "Defaulter list — see who hasn't paid this month",
    ],
  },
  {
    key: "growth" as const,
    name: "Growth",
    tagline: "Run your building like a startup.",
    badge: "Most Popular",
    highlight: true,
    cta: "Get Started",
    href: "/login",
    bullets: [
      "Everything in Starter",
      "Up to 150 flats",
      "Expenses + staff salaries with monthly P&L",
      "Transparency page — income, expenses, fund balance",
      "Notice board for building-wide announcements",
      "Complaints — residents raise, admin resolves",
      "Defaulter privacy toggle",
    ],
  },
  {
    key: "pro" as const,
    name: "Pro",
    tagline: "For large buildings that want the full Pulse experience.",
    highlight: false,
    cta: "Talk to Sales",
    href: waLink(
      "Hi, I'm interested in the Pro plan for Pulse. How do I get started?",
    ),
    bullets: [
      "Everything in Growth",
      "Up to 500 flats",
      "Union — proposals, voting, elections, meetings",
      "Featured /find listings for rent/sale",
      "Services marketplace for residents",
      "Finance suite — PDF statements + CSV export",
    ],
  },
];

const buildingTiers = [
  {
    name: "Twin Tower",
    buildings: 2,
    price: 32000,
    perBuilding: 16000,
    savings: 8000,
    badge: null,
    highlight: false,
    tagline: "Two towers, one society dashboard.",
  },
  {
    name: "Society Block",
    buildings: 5,
    price: 70000,
    perBuilding: 14000,
    savings: 30000,
    badge: "Most Popular",
    highlight: true,
    tagline: "DHA blocks, Bahria phases — the sweet spot.",
  },
  {
    name: "Multi-Tower Society",
    buildings: 10,
    price: 125000,
    perBuilding: 12500,
    savings: 75000,
    badge: "Best Value",
    highlight: false,
    tagline: "Mega societies. Lowest cost per tower.",
  },
];

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
    title: "Building services marketplace",
    body: "B-104 fixes laptops. C-210 cooks biryani. Residents publish skills, neighbors WhatsApp them direct. Community without a Facebook group.",
  },
  {
    icon: Building2,
    title: "Flats listed where buyers actually look",
    body: "Public /find page surfaces your building's flats for rent and sale. Leads route to the Union on WhatsApp — Union brokers, owners win.",
  },
  {
    icon: Users,
    title: "Access that fits every role",
    body: "Super Admin runs the org. Admin runs the building. Union votes. Residents see their own. Nobody touches what they shouldn't.",
  },
];

const faqs = [
  {
    q: "Can I import my existing flat and resident data?",
    a: "Pro tier includes dedicated data migration. On Starter and Growth you can bulk-import flats and residents via CSV.",
  },
  {
    q: "What if I go over the flat limit on my plan?",
    a: "We'll notify you and give you a grace period before prompting an upgrade. No sudden lockouts.",
  },
  {
    q: "Can I switch plans later?",
    a: "Upgrade or downgrade any time. Changes apply on your next billing cycle, prorated.",
  },
  {
    q: "Is resident data safe?",
    a: "Every row is encrypted at rest and in transit. Row-level security in the database means residents only see their own data. Full audit log of every admin action.",
  },
  {
    q: "Do you support multiple buildings in one society?",
    a: "Yes — see the Multi-Building Plans section. Each plan includes a centralized super-admin dashboard across all towers.",
  },
  {
    q: "Can the public /find marketplace be turned off?",
    a: "Yes. The Union holds a master switch in settings. Buildings stay private until the committee turns listings on.",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [societyAnnual, setSocietyAnnual] = useState(false);

  function displayPrice(base: number) {
    const amount = annual ? Math.round(base * (1 - ANNUAL_DISCOUNT)) : base;
    return amount.toLocaleString("en-PK");
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl border p-7 flex flex-col gap-6 ${
                tier.highlight
                  ? "border-primary/40 bg-primary/[0.04] shadow-[0_0_60px_-10px] shadow-primary/20"
                  : "border-sidebar-border bg-card"
              }`}
            >
              {tier.badge && (
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
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-sm text-muted-foreground">PKR</span>
                  <span className="text-4xl font-bold text-foreground tabular-nums">
                    {displayPrice(BASE_PRICES[tier.key])}
                  </span>
                  <span className="text-sm text-muted-foreground pb-1">/mo</span>
                </div>
                {annual && (
                  <p className="text-xs text-primary mb-2">
                    Billed as PKR{" "}
                    {(
                      Math.round(BASE_PRICES[tier.key] * (1 - ANNUAL_DISCOUNT)) *
                      12
                    ).toLocaleString("en-PK")}
                    /year
                  </p>
                )}
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {tier.tagline}
                </p>
              </div>

              <Link
                href={tier.href}
                target={tier.href.startsWith("http") ? "_blank" : undefined}
                rel={tier.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  tier.highlight
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
                    : "border border-sidebar-border hover:border-primary/40 hover:bg-primary/5 text-foreground"
                }`}
              >
                {tier.cta}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>

              <ul className="space-y-3">
                {tier.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5 text-sm">
                    <Check
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        tier.highlight ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <span className="text-muted-foreground leading-relaxed">
                      {bullet}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          Prices in PKR.
        </p>
      </section>

      {/* Multi-building pricing */}
      <section className="relative z-10 px-6 pb-16 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 mb-4">
            <span className="text-xs font-semibold text-primary uppercase tracking-widest">
              Running a society with multiple towers?
            </span>
          </div>
          <h2 className="text-3xl font-serif font-normal tracking-tight mb-2">
            Multi-Building Plans
          </h2>
          <p className="text-muted-foreground text-sm">
            All Pro features included. The more towers, the less you pay per
            building.
          </p>
          <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-sidebar-border bg-card mt-4">
            <button
              onClick={() => setSocietyAnnual(false)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                !societyAnnual
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setSocietyAnnual(true)}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                societyAnnual
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual
              <span
                className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${
                  societyAnnual
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-primary/10 text-primary"
                }`}
              >
                Save 20%
              </span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {buildingTiers.map((tier) => {
            const monthly = societyAnnual
              ? Math.round(tier.price * (1 - ANNUAL_DISCOUNT))
              : tier.price;
            const perBuilding = societyAnnual
              ? Math.round(tier.perBuilding * (1 - ANNUAL_DISCOUNT))
              : tier.perBuilding;
            return (
              <div
                key={tier.buildings}
                className={`relative rounded-2xl border p-7 flex flex-col gap-6 ${
                  tier.highlight
                    ? "border-primary/40 bg-primary/[0.04] shadow-[0_0_60px_-10px] shadow-primary/20"
                    : "border-sidebar-border bg-card"
                }`}
              >
                {tier.badge && (
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
                  <div className="flex items-end gap-1 mb-1">
                    <span className="text-sm text-muted-foreground">PKR</span>
                    <span className="text-4xl font-bold text-foreground tabular-nums">
                      {monthly.toLocaleString("en-PK")}
                    </span>
                    <span className="text-sm text-muted-foreground pb-1">
                      /mo
                    </span>
                  </div>
                  <p className="text-xs text-primary font-medium mb-1">
                    PKR {perBuilding.toLocaleString("en-PK")}/building · Save
                    PKR {tier.savings.toLocaleString("en-PK")} vs individual
                    Pro plans
                  </p>
                  {societyAnnual && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Billed as PKR {(monthly * 12).toLocaleString("en-PK")}
                      /year
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {tier.tagline}
                  </p>
                </div>
                <a
                  href={waLink(
                    `Hi, I'm interested in the ${tier.name} plan for Pulse. How do I get started?`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    tier.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
                      : "border border-sidebar-border hover:border-primary/40 hover:bg-primary/5 text-foreground"
                  }`}
                >
                  Talk to Sales <ArrowRight className="w-3.5 h-3.5" />
                </a>
                <ul className="space-y-3">
                  {[
                    `${tier.buildings} buildings under one society account`,
                    "Everything in Pro — all features included",
                    "Up to 500 flats per building",
                    "Centralized super-admin dashboard across all towers",
                    "Dedicated onboarding for the society committee",
                  ].map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2.5 text-sm"
                    >
                      <Check
                        className={`w-4 h-4 shrink-0 mt-0.5 ${
                          tier.highlight
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}
                      />
                      <span className="text-muted-foreground leading-relaxed">
                        {bullet}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          More than 10 buildings?{" "}
          <a
            href={waLink(
              "Hi, I need a custom multi-building plan for Pulse. We manage more than 10 towers.",
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-muted-foreground transition-colors"
          >
            Contact us for a custom plan.
          </a>
        </p>
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
                  <p className="text-xs text-foreground leading-relaxed">
                    {fix}
                  </p>
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

      {/* FAQ */}
      <section className="relative z-10 px-6 py-12 max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-serif font-normal tracking-tight mb-2">
            Common questions
          </h2>
          <p className="text-muted-foreground">
            Anything else — WhatsApp us directly.
          </p>
        </div>
        <div className="space-y-3">
          {faqs.map(({ q, a }) => (
            <div
              key={q}
              className="rounded-2xl border border-sidebar-border bg-card px-6 py-5"
            >
              <p className="font-semibold text-foreground mb-2">{q}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {a}
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
            assume the worst about the committee. Most buildings fix all three
            in their first week on Pulse.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/login"
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/20 text-sm"
            >
              Apply for Trial
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
              Talk to sales
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
