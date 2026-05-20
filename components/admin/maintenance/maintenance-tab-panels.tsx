"use client";

import { useEffect, useState } from "react";
import { Wallet, CreditCard, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Maintenance tab switcher + panels.
 *
 * Performance design:
 *   The server renders ALL THREE tab bodies in parallel on initial page load
 *   (each in its own Suspense boundary). This client component then toggles
 *   visibility via the `hidden` attribute — tab clicks never round-trip to
 *   the server, never re-fetch, never re-render. Switching is instant.
 *
 *   URL stays in sync via `history.replaceState` for deep links + bookmarks,
 *   but NOT `router.replace` (which would trigger a soft navigation and refetch).
 *   A `popstate` listener handles browser back/forward.
 *
 *   Trade-off: ~3x data is fetched on initial load. Parallel Suspense streaming
 *   means wall time is ~max(per-tab time), not 3x sum. Inactive panels still
 *   paint to DOM in the background. Net win for the chowkidar workflow which
 *   bounces between tabs constantly.
 */

export type MaintenanceTab = "dues" | "payments" | "invoices";

const TABS: { id: MaintenanceTab; label: string; icon: typeof Wallet }[] = [
  { id: "dues", label: "Dues", icon: Wallet },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "invoices", label: "Invoices", icon: FileText },
];

function readUrlTab(): MaintenanceTab {
  if (typeof window === "undefined") return "dues";
  const t = new URLSearchParams(window.location.search).get("tab");
  return t === "payments" || t === "invoices" ? t : "dues";
}

export function MaintenanceTabPanels({
  initialTab,
  dues,
  payments,
  invoices,
}: {
  initialTab: MaintenanceTab;
  dues: React.ReactNode;
  payments: React.ReactNode;
  invoices: React.ReactNode;
}) {
  const [active, setActive] = useState<MaintenanceTab>(initialTab);

  // Sync state with browser back/forward + any other code that calls replaceState.
  useEffect(() => {
    const sync = () => setActive(readUrlTab());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const switchTab = (next: MaintenanceTab) => {
    if (next === active) return;
    setActive(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "dues") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    const url = qs ? `/admin/maintenance?${qs}` : "/admin/maintenance";
    window.history.replaceState(null, "", url);
  };

  const panels: { id: MaintenanceTab; node: React.ReactNode }[] = [
    { id: "dues", node: dues },
    { id: "payments", node: payments },
    { id: "invoices", node: invoices },
  ];

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Maintenance sections"
        className="inline-flex items-center gap-1 rounded-lg bg-muted p-1 border border-border"
      >
        {TABS.map((t) => {
          const isActive = active === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => switchTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-all",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {panels.map((p) => (
        <div
          key={p.id}
          role="tabpanel"
          id={`tabpanel-${p.id}`}
          aria-labelledby={`tab-${p.id}`}
          hidden={active !== p.id}
        >
          {p.node}
        </div>
      ))}
    </div>
  );
}
