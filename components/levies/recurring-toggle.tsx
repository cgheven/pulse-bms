"use client";

import { useState } from "react";
import { setLevyActive } from "@/app/actions/levies";

interface Props {
  levyId: string;
  isActive: boolean;
  /** Stop card-link navigation when the toggle sits inside a clickable card. */
  stopPropagation?: boolean;
  /** Hide the Active/Paused text when adjacent copy already states the status. */
  hideLabel?: boolean;
}

export function RecurringToggle({ levyId, isActive, stopPropagation, hideLabel }: Props) {
  const [active, setActive] = useState(isActive);
  const [pending, setPending] = useState(false);

  async function toggle(e: React.MouseEvent) {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    const next = !active;
    setPending(true);
    setActive(next); // optimistic
    try {
      await setLevyActive(levyId, next);
    } catch {
      setActive(!next); // revert on failure
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={active ? "Deactivate recurring levy" : "Activate recurring levy"}
        disabled={pending}
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 ${
          active ? "bg-emerald-500" : "bg-muted-foreground/40"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            active ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      {!hideLabel && (
        <span
          className={`text-xs font-medium ${active ? "text-emerald-600" : "text-muted-foreground"}`}
        >
          {active ? "Active" : "Paused"}
        </span>
      )}
    </div>
  );
}
