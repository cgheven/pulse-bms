"use client";

// Inline interest-level pill rendered on each row of the Leads list.
// Clicking opens a tiny popover with the three options; selection
// patches the lead's `temperature` column server-side and refreshes
// the list. Saves the sales rep a click into the detail page just to
// move a lead between High / Medium / Low.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { cn } from "@/lib/utils";
import {
  updateLeadInterest,
  type LeadTemperature,
} from "@/app/actions/leads";

const OPTIONS: {
  value: LeadTemperature;
  label: string;
  emoji: string;
  pill: string;
  row: string;
  hint: string;
}[] = [
  {
    value: "hot",
    label: "High",
    emoji: "🔥",
    pill: "bg-destructive/15 text-destructive border border-destructive/30",
    row: "hover:bg-destructive/10",
    hint: "Likely to close",
  },
  {
    value: "warm",
    label: "Medium",
    emoji: "🌡️",
    pill: "bg-warning/15 text-warning border border-warning/30",
    row: "hover:bg-warning/10",
    hint: "Needs nurture",
  },
  {
    value: "cold",
    label: "Low",
    emoji: "❄️",
    pill: "bg-info/15 text-info border border-info/30",
    row: "hover:bg-info/10",
    hint: "Not promising",
  },
];

function optionFor(value: LeadTemperature) {
  return OPTIONS.find((o) => o.value === value) ?? OPTIONS[1];
}

export function LeadRowInterest({
  leadId,
  value,
}: {
  leadId: string;
  value: LeadTemperature;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Optimistic local value so the pill updates instantly while the
  // server action runs. Reverts if the action throws.
  const [optimistic, setOptimistic] = useState<LeadTemperature>(value);
  const ref = useRef<HTMLDivElement>(null);

  // Keep optimistic in sync if the parent passes a fresh value
  // (e.g. after router.refresh).
  useEffect(() => {
    setOptimistic(value);
  }, [value]);

  // Close on outside click — keeps the popover lightweight, no Radix.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function pick(next: LeadTemperature) {
    setOpen(false);
    if (next === optimistic) return;
    const previous = optimistic;
    setOptimistic(next);
    startTransition(async () => {
      try {
        await updateLeadInterest(leadId, next);
        router.refresh();
      } catch (err) {
        // Rollback optimistic state on failure.
        setOptimistic(previous);
        toast({
          title: "Could not update interest",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  const current = optionFor(optimistic);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        title="Click to change interest level"
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-semibold transition hover:opacity-80 cursor-pointer disabled:cursor-wait",
          current.pill,
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span aria-hidden>{current.emoji}</span>
        {current.label}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute z-30 top-full mt-1.5 left-0 w-44 rounded-xl border border-border bg-card shadow-2xl p-1 animate-fade-in"
        >
          {OPTIONS.map((opt) => {
            const selected = opt.value === optimistic;
            return (
              <button
                key={opt.value}
                role="menuitem"
                type="button"
                onClick={() => pick(opt.value)}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md transition text-sm flex items-start gap-2",
                  opt.row,
                  selected && "bg-secondary/60",
                )}
              >
                <span className="text-base leading-none mt-0.5">
                  {opt.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground leading-tight">
                    {opt.label}
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {opt.hint}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
