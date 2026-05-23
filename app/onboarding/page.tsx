"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { submitOnboarding } from "@/app/actions/onboarding";

const SALES_WA = "923332994029";

const ROLES: { value: ContactRole; label: string }[] = [
  { value: "president", label: "President" },
  { value: "treasurer", label: "Treasurer" },
  { value: "secretary", label: "Secretary" },
  { value: "member", label: "Committee member" },
  { value: "admin", label: "Admin / Manager" },
  { value: "other", label: "Other" },
];

type ContactRole =
  | "president"
  | "treasurer"
  | "secretary"
  | "member"
  | "admin"
  | "other";

type CallTime = "morning" | "afternoon" | "evening" | "anytime";

const CALL_TIMES: { value: CallTime; label: string }[] = [
  { value: "morning", label: "Morning (9am – 12pm)" },
  { value: "afternoon", label: "Afternoon (12pm – 5pm)" },
  { value: "evening", label: "Evening (5pm – 9pm)" },
  { value: "anytime", label: "Anytime — no preference" },
];

const CALL_TIME_LABEL: Record<CallTime, string> = {
  morning: "Morning (9am – 12pm)",
  afternoon: "Afternoon (12pm – 5pm)",
  evening: "Evening (5pm – 9pm)",
  anytime: "Anytime",
};

export default function OnboardingPage() {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  // Form state — kept local; submitted via server action.
  const [buildingName, setBuildingName] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("Karachi");
  const [flatCount, setFlatCount] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState<ContactRole>("president");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [callTime, setCallTime] = useState<CallTime>("anytime");
  // Target go-live date — optional. When set, gets prepended to lead's
  // notes so the sales rep can see urgency at a glance.
  const [targetLiveDate, setTargetLiveDate] = useState("");
  // Honeypot — must remain empty. Bots auto-fill anything called
  // "website_url"; humans never see it.
  const [websiteUrl, setWebsiteUrl] = useState("");

  // Today's ISO date for the min attribute on the target-live picker.
  const todayIso = new Date().toISOString().slice(0, 10);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!buildingName.trim()) {
      toast({ title: "Building name is required", variant: "destructive" });
      return;
    }
    if (!contactName.trim()) {
      toast({ title: "Your name is required", variant: "destructive" });
      return;
    }
    if (!whatsapp.trim()) {
      toast({ title: "WhatsApp number is required", variant: "destructive" });
      return;
    }
    const flats = Number(flatCount);
    if (!Number.isFinite(flats) || flats < 1) {
      toast({ title: "How many flats does your society have?", variant: "destructive" });
      return;
    }

    // Prepend the chosen call-window + target go-live date to the notes
    // so the sales rep sees urgency + reachability at the top of the
    // lead's free-text context. Cheaper than new schema columns for
    // v1 signals.
    const callTimeLine = `Preferred call time: ${CALL_TIME_LABEL[callTime]}`;
    const targetLine = targetLiveDate
      ? `Wants to go live by: ${targetLiveDate}`
      : "";
    const mergedNotes = [callTimeLine, targetLine, notes.trim()]
      .filter(Boolean)
      .join("\n");

    startTransition(async () => {
      try {
        await submitOnboarding({
          building_name: buildingName,
          area: area || null,
          city: city || "Karachi",
          flat_count: flats,
          contact_name: contactName,
          contact_role: contactRole,
          whatsapp_number: whatsapp,
          email: email || null,
          notes: mergedNotes || null,
          website_url: websiteUrl,
        });
        setDone(true);
      } catch (err) {
        toast({
          title: "Could not submit",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ambient glow — matches /pricing page aesthetic */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-primary/[0.06] blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-3xl mx-auto">
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
          href="/pricing"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Pricing
        </Link>
      </nav>

      {/* Success state */}
      {done ? (
        <section className="relative z-10 px-6 pt-16 pb-24 max-w-2xl mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-success/15 border border-success/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-foreground leading-[1.1] mb-3">
            We&apos;ve got your details.
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
            We&apos;ll WhatsApp you today — usually within the hour — to walk
            through next steps.
          </p>

          {/* Speed-up CTA — pinging us on WhatsApp tells the team to
              start prepping account credentials immediately. Pre-fills
              the building name so the sales rep has full context the
              moment the message lands. */}
          <div className="rounded-2xl border-2 border-success/30 bg-gradient-to-br from-success/[0.08] to-success/[0.02] p-5 sm:p-6 max-w-lg mx-auto mb-6 shadow-[0_0_30px_-12px] shadow-success/30">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-success mb-2">
              Want it faster?
            </p>
            <p className="text-sm text-foreground mb-4 leading-relaxed">
              Ping us on WhatsApp now and we&apos;ll start preparing your
              account credentials right away — usually ready within the
              same business day.
            </p>
            <a
              href={`https://wa.me/${SALES_WA}?text=${encodeURIComponent(
                `Hi, I just submitted the Pulse onboarding form for ${buildingName || "my society"}. Please prepare my account credentials at your earliest.`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-success text-white text-sm font-semibold hover:bg-success/90 transition shadow-md shadow-success/30"
            >
              <MessageCircle className="w-4 h-4" />
              Notify us on WhatsApp
            </a>
          </div>

          <div className="text-xs text-muted-foreground/60">
            <Link
              href="/pricing"
              className="hover:text-muted-foreground transition-colors"
            >
              ← Back to pricing
            </Link>
          </div>
        </section>
      ) : (
        /* ── Form ─────────────────────────────────────────────────── */
        <section className="relative z-10 px-6 pt-6 pb-20 max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-semibold text-primary uppercase tracking-widest">
                Easy Onboarding
              </span>
            </div>
            <h1 className="font-serif text-3xl sm:text-[42px] font-medium tracking-[-0.02em] text-foreground leading-[1.05] mb-4">
              Tell us about your{" "}
              <em className="not-italic text-primary">society</em>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
              60 seconds to fill. We&apos;ll WhatsApp you today — usually
              within the hour. No card. No setup fee.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-primary/20 bg-card p-6 sm:p-8 space-y-6"
          >
            {/* Honeypot — invisible to humans, irresistible to bots */}
            <div
              className="absolute -left-[9999px]"
              aria-hidden
              tabIndex={-1}
            >
              <label>
                Website
                <input
                  type="text"
                  name="website_url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>
            </div>

            {/* Section: Society */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
                Your Society
              </p>

              <div>
                <label
                  htmlFor="building_name"
                  className="block text-sm text-muted-foreground mb-1.5"
                >
                  Building name <span className="text-destructive">*</span>
                </label>
                <input
                  id="building_name"
                  type="text"
                  required
                  placeholder="e.g. Crescent Heights"
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-sidebar-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                <div>
                  <label
                    htmlFor="area"
                    className="block text-sm text-muted-foreground mb-1.5"
                  >
                    Area / block
                  </label>
                  <input
                    id="area"
                    type="text"
                    placeholder="e.g. Gulshan Block 14"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-sidebar-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                  />
                </div>
                <div>
                  <label
                    htmlFor="city"
                    className="block text-sm text-muted-foreground mb-1.5"
                  >
                    City
                  </label>
                  <input
                    id="city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-sidebar-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="flat_count"
                  className="block text-sm text-muted-foreground mb-1.5"
                >
                  Number of flats <span className="text-destructive">*</span>
                </label>
                <input
                  id="flat_count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50000}
                  required
                  placeholder="e.g. 250"
                  value={flatCount}
                  onChange={(e) => setFlatCount(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-sidebar-border bg-background text-foreground text-base font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                />
                <p className="text-xs text-muted-foreground/70 mt-1.5">
                  Drives which plan fits your society. Rough estimate is fine.
                </p>
              </div>
            </div>

            <div className="h-px bg-sidebar-border/60" />

            {/* Section: Contact */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
                Your Contact
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="contact_name"
                    className="block text-sm text-muted-foreground mb-1.5"
                  >
                    Your full name <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="contact_name"
                    type="text"
                    required
                    placeholder="e.g. Tariq Khatri"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-sidebar-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                  />
                </div>
                <div>
                  <label
                    htmlFor="contact_role"
                    className="block text-sm text-muted-foreground mb-1.5"
                  >
                    Your role
                  </label>
                  <select
                    id="contact_role"
                    value={contactRole}
                    onChange={(e) =>
                      setContactRole(e.target.value as ContactRole)
                    }
                    className="w-full h-11 px-3 rounded-lg border border-sidebar-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="whatsapp"
                    className="block text-sm text-muted-foreground mb-1.5"
                  >
                    WhatsApp number{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="whatsapp"
                    type="tel"
                    required
                    placeholder="0300-1234567"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-sidebar-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                  />
                </div>
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm text-muted-foreground mb-1.5"
                  >
                    Email{" "}
                    <span className="text-muted-foreground/60 text-xs">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-sidebar-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="call_time"
                  className="block text-sm text-muted-foreground mb-1.5"
                >
                  Best time to call you
                </label>
                <select
                  id="call_time"
                  value={callTime}
                  onChange={(e) => setCallTime(e.target.value as CallTime)}
                  className="w-full h-11 px-3 rounded-lg border border-sidebar-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                >
                  {CALL_TIMES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground/70 mt-1.5">
                  We&apos;ll WhatsApp first; if you prefer a phone call we&apos;ll
                  ring you in this window.
                </p>
              </div>

              <div>
                <label
                  htmlFor="target_live_date"
                  className="block text-sm text-muted-foreground mb-1.5"
                >
                  When do you want to be live?{" "}
                  <span className="text-muted-foreground/60 text-xs">
                    (optional)
                  </span>
                </label>
                <input
                  id="target_live_date"
                  type="date"
                  min={todayIso}
                  value={targetLiveDate}
                  onChange={(e) => setTargetLiveDate(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-sidebar-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                />
                <p className="text-xs text-muted-foreground/70 mt-1.5">
                  Target launch day — helps us prioritise. Big meeting
                  coming up? Pick that date.
                </p>
              </div>

              <div>
                <label
                  htmlFor="notes"
                  className="block text-sm text-muted-foreground mb-1.5"
                >
                  Anything we should know?{" "}
                  <span className="text-muted-foreground/60 text-xs">
                    (optional)
                  </span>
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  placeholder="e.g. big meeting in 3 weeks · chasing dues is our biggest problem · we have 2 towers"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-sidebar-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 resize-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={pending}
              className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition shadow-md shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {pending ? "Submitting…" : "Get Started"}
              {!pending && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          {/* Alternative WhatsApp path */}
          <p className="text-center text-xs text-muted-foreground/60 mt-6">
            Prefer WhatsApp?{" "}
            <a
              href={`https://wa.me/${SALES_WA}?text=${encodeURIComponent(
                "Hi, I'd like to onboard my society to Pulse. Can you help?",
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Message us directly →
            </a>
          </p>
        </section>
      )}
    </div>
  );
}
