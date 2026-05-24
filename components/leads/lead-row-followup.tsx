"use client";

// Inline follow-up-date editor rendered in the Next-follow-up column of
// the Leads list. Click the date (or em-dash) to reveal a native date
// input; picking a new value patches the lead and refreshes the row.
// Lets the sales rep reschedule without opening the detail page.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { setLeadNextFollowup } from "@/app/actions/leads";

export function LeadRowFollowup({
  leadId,
  value,
  isOverdue,
}: {
  leadId: string;
  value: string | null;
  isOverdue: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  // Optimistic value so the cell updates the instant the rep picks a
  // date. Rolls back on action failure.
  const [optimistic, setOptimistic] = useState<string | null>(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOptimistic(value);
  }, [value]);

  // Auto-focus + open the native picker when we enter edit mode.
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // showPicker exists on modern browsers; falls back silently
    // (the user can still click the input).
    type WithShowPicker = HTMLInputElement & { showPicker?: () => void };
    (el as WithShowPicker).showPicker?.();
  }, [editing]);

  function save(next: string | null) {
    const previous = optimistic;
    setOptimistic(next);
    setEditing(false);
    if (next === previous) return;
    startTransition(async () => {
      try {
        await setLeadNextFollowup(leadId, next);
        router.refresh();
      } catch (err) {
        setOptimistic(previous);
        toast({
          title: "Could not update follow-up",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="date"
          defaultValue={optimistic ?? ""}
          onChange={(e) => save(e.target.value || null)}
          onBlur={() => setEditing(false)}
          className="h-8 px-2 rounded-md border border-primary/40 bg-card text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={pending}
        title="Click to change follow-up date"
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-sm tabular-nums transition hover:bg-secondary/60 cursor-pointer disabled:cursor-wait",
          isOverdue && optimistic && "text-destructive font-semibold",
          !optimistic && "text-muted-foreground",
        )}
      >
        <Calendar className="w-3 h-3 opacity-60" />
        {optimistic ? formatDate(optimistic) : "Set date"}
      </button>
      {optimistic && (
        <button
          type="button"
          onClick={() => save(null)}
          disabled={pending}
          title="Clear follow-up date"
          aria-label="Clear follow-up date"
          className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
