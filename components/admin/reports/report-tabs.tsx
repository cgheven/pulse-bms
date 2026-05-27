"use client";

import Link from "next/link";
import { Wallet, Receipt, HandCoins, Coins, Banknote, BookText, Sparkles, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal tab strip at the top of every report page. Switching between
 * tabs is a soft nav (Next.js Link with prefetch) — first visit pre-warms
 * the other tabs so subsequent clicks feel instant. Each tab has its own
 * URL so deep-links, browser back/forward, and bookmarks all work.
 */

export type ReportTabId =
  | "expenses"
  | "bills"
  | "projects"
  | "maintenance-collection"
  | "overall-collection"
  | "day-book"
  | "cash-position"
  | "inventory";

// Tab order: Income Register lands first (default view) — that's the
// committee's day-1 question: "what came in this month?". Day Book is
// the accountant's narrative "Roznamcha" — sits next to Cash Book which
// closes the row with the audit close-out check.
const TABS: { id: ReportTabId; label: string; icon: typeof Wallet; href: string }[] = [
  {
    id: "overall-collection",
    label: "Income Register",
    icon: Coins,
    href: "/admin/reports/overall-collection",
  },
  {
    id: "maintenance-collection",
    label: "Maintenance",
    icon: HandCoins,
    href: "/admin/reports/maintenance-collection",
  },
  { id: "expenses", label: "Expenses", icon: Wallet, href: "/admin/reports/expenses" },
  { id: "bills", label: "Bills", icon: Receipt, href: "/admin/reports/bills" },
  {
    id: "projects",
    label: "Projects",
    icon: Sparkles,
    href: "/admin/reports/projects",
  },
  {
    id: "day-book",
    label: "Day Book",
    icon: BookText,
    href: "/admin/reports/day-book",
  },
  {
    id: "cash-position",
    label: "Cash Book",
    icon: Banknote,
    href: "/admin/reports/cash-position",
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: Archive,
    href: "/admin/reports/inventory",
  },
];

export function ReportTabs({ active }: { active: ReportTabId }) {
  return (
    <div
      role="tablist"
      aria-label="Reports"
      className="inline-flex items-center gap-1 rounded-lg bg-muted p-1 border border-border overflow-x-auto"
    >
      {TABS.map((t) => {
        const isActive = active === t.id;
        const Icon = t.icon;
        return (
          <Link
            key={t.id}
            href={t.href}
            prefetch
            role="tab"
            aria-selected={isActive}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
