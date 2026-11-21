"use client";

import Link from "next/link";
import {
  Building2,
  Home,
  Users,
  Receipt,
  CreditCard,
  Landmark,
  Wallet,
  UserCog,
  Megaphone,
  Check,
  ChevronRight,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SetupStatus, SetupStepKey } from "@/app/actions/setup";

type Meta = {
  icon: typeof Home;
  title: string;
  desc: string;
  href: string;
  cta: string;
};

const META: Record<SetupStepKey, Meta> = {
  details: {
    icon: Building2,
    title: "Building details",
    desc: "Name, address and city — the basics shown across the app and on receipts.",
    href: "/admin/settings",
    cta: "Open Settings",
  },
  flats: {
    icon: Home,
    title: "Add your flats",
    desc: "Create the units in your building. You can add them one by one or import in bulk.",
    href: "/admin/flats",
    cta: "Add flats",
  },
  residents: {
    icon: Users,
    title: "Add residents",
    desc: "Owners and tenants, linked to their flats. Import from Excel or add individually.",
    href: "/admin/residents",
    cta: "Add residents",
  },
  invoices: {
    icon: Receipt,
    title: "Generate maintenance bills",
    desc: "Raise the monthly maintenance invoices for your flats on the Maintenance page.",
    href: "/admin/maintenance",
    cta: "Open Maintenance",
  },
  payment: {
    icon: CreditCard,
    title: "Record your first payment",
    desc: "Collect a maintenance payment and issue a receipt — this completes the billing cycle.",
    href: "/admin/payments",
    cta: "Record a payment",
  },
  opening: {
    icon: Wallet,
    title: "Opening fund balance",
    desc: "Set the society's starting cash/bank balance so every report reconciles from day one.",
    href: "/admin/settings",
    cta: "Set balance",
  },
  bank: {
    icon: Landmark,
    title: "Add a bank account",
    desc: "The society account shown to residents in rent reminders and on the Transparency page.",
    href: "/admin/settings",
    cta: "Add account",
  },
  staff: {
    icon: UserCog,
    title: "Add staff",
    desc: "Guards, sweepers, lift operators and more — track attendance and salaries later.",
    href: "/admin/staff",
    cta: "Add staff",
  },
  notice: {
    icon: Megaphone,
    title: "Post a notice",
    desc: "Share your first announcement with residents — meetings, maintenance, reminders.",
    href: "/admin/notices",
    cta: "Post a notice",
  },
};

export function SetupClient({
  status,
  buildingName,
}: {
  status: SetupStatus;
  buildingName: string;
}) {
  const { steps, done, total, setupComplete } = status;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-up pb-10">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="font-medium">Quick Setup</span>
        </div>
        <h1>Set up {buildingName}</h1>
        <p className="text-sm text-muted-foreground">
          Work down the list — each step opens the right page, and ticks itself automatically
          once you&apos;ve added the data. No need to hunt through the app.
        </p>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {done} of {total} done
          </span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {setupComplete && (
        <div className="flex items-start gap-3 rounded-xl border border-[hsl(151_70%_32%/0.3)] bg-[hsl(151_70%_32%/0.1)] p-4 text-sm text-[hsl(151_70%_55%)]">
          <Check className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">You&apos;re all set up!</p>
            <p className="mt-0.5 text-[hsl(151_70%_55%/0.9)]">
              Every essential step is done. The optional steps below are nice-to-haves whenever
              you&apos;re ready.
            </p>
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((s) => {
          const m = META[s.key];
          const Icon = m.icon;
          return (
            <Link
              key={s.key}
              href={m.href}
              className={cn(
                "group flex items-start gap-3 rounded-xl border bg-card p-4 shadow-lg transition-colors",
                s.done
                  ? "border-[hsl(151_70%_32%/0.35)] hover:border-[hsl(151_70%_32%/0.55)]"
                  : "border-border hover:border-primary/40 hover:bg-secondary/20",
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  s.done
                    ? "bg-[hsl(151_70%_32%/0.15)] text-[hsl(151_70%_55%)]"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {s.done ? <Check className="h-4.5 w-4.5" /> : <Icon className="h-4.5 w-4.5" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold leading-tight text-foreground">{m.title}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      s.required
                        ? "bg-primary/15 text-primary"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {s.required ? "Required" : "Optional"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{m.desc}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  {s.done ? "Review" : m.cta}
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end pt-2">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Go to dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
