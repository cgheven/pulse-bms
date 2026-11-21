"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Rocket, ArrowRight, X } from "lucide-react";

const DISMISS_KEY = "bms-setup-banner-dismissed";

/**
 * Dismissible "finish setup" banner on the admin dashboard. Rendered only while
 * setup is incomplete (the server wrapper returns null once every required step
 * is done). Dismissal is a per-browser convenience stored in localStorage — it
 * is NOT durable state, so it's wrapped in try/catch and the banner renders
 * correctly if storage is unavailable.
 */
export function SetupBannerCard({
  requiredDone,
  requiredTotal,
}: {
  requiredDone: number;
  requiredTotal: number;
}) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* storage blocked — show the banner */
    }
  }, []);

  if (dismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Rocket className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight text-foreground">
          Finish setting up your building
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {requiredDone} of {requiredTotal} essential steps done — Quick Setup walks you through
          the rest in a few minutes.
        </p>
      </div>
      <Link
        href="/admin/setup"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Finish setup
        <ArrowRight className="h-4 w-4" />
      </Link>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
