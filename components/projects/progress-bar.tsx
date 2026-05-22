"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Hero progress bar for Project Funds.
 *
 * Style notes:
 *  - 12px tall on cards, 24px on the detail page (caller passes `size`)
 *  - gradient fill animates on first paint via a setTimeout flip — keeps
 *    the bar at 0 for one tick so the CSS transition runs even on a fresh
 *    server render
 *  - rounded with subtle inner ring for the "rail"
 *  - the fill switches palette automatically when progress is ≥ 1
 */
export function ProjectProgressBar({
  progress,
  size = "md",
  status,
}: {
  /** 0..1; null means voluntary / open-ended — renders a striped "no target" bar */
  progress: number | null;
  size?: "sm" | "md" | "lg";
  status?: "active" | "closed" | "cancelled";
}) {
  const [animatedPct, setAnimatedPct] = useState(0);
  const initialRender = useRef(true);

  useEffect(() => {
    // First paint: hold at 0 then flip to target so the bar animates in.
    if (initialRender.current) {
      initialRender.current = false;
      const t = setTimeout(() => {
        setAnimatedPct(progress != null ? Math.min(1, Math.max(0, progress)) : 0);
      }, 60);
      return () => clearTimeout(t);
    }
    setAnimatedPct(progress != null ? Math.min(1, Math.max(0, progress)) : 0);
  }, [progress]);

  const heightClass =
    size === "lg" ? "h-6" : size === "sm" ? "h-2.5" : "h-3.5";
  const isComplete = progress != null && progress >= 1;
  const isCancelled = status === "cancelled";

  // Voluntary projects: striped "no target" rail
  if (progress == null) {
    return (
      <div
        className={cn(
          "relative w-full rounded-full overflow-hidden bg-secondary/60 ring-1 ring-inset ring-border",
          heightClass,
        )}
        aria-label="Voluntary project (no target)"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(45deg, hsl(38 92% 55% / 0.18) 0 10px, hsl(38 92% 55% / 0.06) 10px 20px)",
          }}
        />
      </div>
    );
  }

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(animatedPct * 100)}
      className={cn(
        "relative w-full rounded-full overflow-hidden bg-secondary/60 ring-1 ring-inset ring-border",
        heightClass,
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full transition-[width] duration-[1100ms] ease-out",
          isCancelled
            ? "bg-gradient-to-r from-muted via-muted-foreground/40 to-muted"
            : isComplete
            ? "bg-gradient-to-r from-[hsl(151_100%_38%)] via-[hsl(151_100%_45%)] to-[hsl(151_100%_55%)] shadow-[0_0_12px_-2px_hsl(151_100%_45%/0.6)]"
            : "bg-gradient-to-r from-[hsl(38_92%_50%)] via-[hsl(38_92%_60%)] to-[hsl(38_92%_70%)] shadow-[0_0_12px_-2px_hsl(38_92%_55%/0.45)]",
        )}
        style={{ width: `${Math.round(animatedPct * 100)}%` }}
      />
    </div>
  );
}
