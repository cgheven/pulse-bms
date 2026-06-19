"use client";

import Link from "next/link";
import { LayoutDashboard, Coins, CreditCard, BookText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReportTabId =
  | "summary"
  | "collections"
  | "spending"
  | "day-book"
  | "projects";

const TABS: { id: ReportTabId; label: string; icon: typeof Coins; href: string }[] = [
  { id: "summary",     label: "Summary",     icon: LayoutDashboard, href: "/admin/reports/summary" },
  { id: "collections", label: "Collections", icon: Coins,           href: "/admin/reports/overall-collection" },
  { id: "spending",    label: "Spending",    icon: CreditCard,      href: "/admin/reports/spending" },
  { id: "day-book",    label: "Day Book",    icon: BookText,        href: "/admin/reports/day-book" },
  { id: "projects",    label: "Projects",    icon: Sparkles,        href: "/admin/reports/projects" },
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
