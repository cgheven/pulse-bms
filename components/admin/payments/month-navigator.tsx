"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthLabel } from "@/lib/utils";

/**
 * The `‹ November 2026 ›` month stepper shown in the Maintenance title row.
 * URL-driven (`?duesMonth=`), so stepping re-fetches the whole page for the
 * chosen month. availableMonths is newest-first, so older = next index.
 */
export function MonthNavigator({
  month,
  availableMonths,
}: {
  month: string;
  availableMonths: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const idx = availableMonths.indexOf(month);
  const older = idx >= 0 && idx < availableMonths.length - 1 ? availableMonths[idx + 1] : null;
  const newer = idx > 0 ? availableMonths[idx - 1] : null;

  const go = (m: string | null) => {
    if (!m) return;
    startTransition(() => {
      router.push(`/admin/maintenance?duesMonth=${m}`, { scroll: false });
    });
  };

  return (
    <div
      className="inline-flex items-center rounded-lg border border-border bg-secondary/40 shrink-0"
      aria-busy={isPending}
    >
      <button
        type="button"
        onClick={() => go(older)}
        disabled={!older}
        aria-label="Previous month"
        className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="px-2 min-w-[8.5rem] text-center text-sm font-medium tabular-nums">
        {formatMonthLabel(month)}
      </span>
      <button
        type="button"
        onClick={() => go(newer)}
        disabled={!newer}
        aria-label="Next month"
        className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
