import Link from "next/link";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact dashboard KPI tile — the single source of truth for every stat
 * card across the admin / union / resident / super-admin dashboards.
 *
 * Replaces four near-identical local card components that had drifted apart
 * (different paddings, value sizes and 2-wide layouts that wasted space). The
 * design is deliberately dense: a `p-4` surface, an icon chip top-right that
 * shares the label row, a tight `text-xl sm:text-2xl` value, and an optional
 * one-line sub. Pack 4–6 of these per row instead of 2 oversized ones.
 */

export type StatTone =
  | "default" // neutral — foreground value, amber icon chip
  | "primary" // amber — the lead / hero figure
  | "success" // green — money in, healthy
  | "danger" // red — money out, overdue, risk
  | "warning" // amber — needs a look
  | "info"; // cyan — informational

type LucideIcon = React.ComponentType<{ className?: string }>;

const TONE: Record<StatTone, { value: string; chip: string; hover: string }> = {
  default: {
    value: "text-foreground",
    chip: "bg-primary/10 text-primary",
    hover: "hover:border-primary/40",
  },
  primary: {
    value: "text-primary",
    chip: "bg-primary/15 text-primary",
    hover: "hover:border-primary/50",
  },
  success: {
    value: "text-[hsl(151_70%_55%)]",
    chip: "bg-[hsl(151_70%_55%)]/12 text-[hsl(151_70%_55%)]",
    hover: "hover:border-[hsl(151_70%_55%/0.45)]",
  },
  // Refined rose — money-out / risk on a KPI tile. Deliberately softer and
  // lighter than --destructive (which stays loud for delete/error actions):
  // a saturated maroon red on the dark navy reads as an alarm and cheapens
  // the dashboard. This muted coral-rose matches the HMS card palette.
  danger: {
    value: "text-[hsl(350_80%_68%)]",
    chip: "bg-[hsl(350_80%_68%)]/12 text-[hsl(350_80%_68%)]",
    hover: "hover:border-[hsl(350_80%_68%/0.45)]",
  },
  warning: {
    value: "text-primary",
    chip: "bg-warning/15 text-warning",
    hover: "hover:border-primary/45",
  },
  info: {
    value: "text-info",
    chip: "bg-info/15 text-info",
    hover: "hover:border-info/45",
  },
};

export type StatCardProps = {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** One-line context under the value. Truncated to a single line. */
  sub?: React.ReactNode;
  /** Makes the whole tile a deep-link with a hover affordance. */
  href?: string;
  tone?: StatTone;
  /**
   * Optional trend pill. `value` is the signed delta (e.g. +12).
   * `goodWhenUp` defaults to true (collections); set false for expenses,
   * where a rise is bad and should read red.
   */
  trend?: { value: number; suffix?: string; goodWhenUp?: boolean };
  /** The lead card: amber glow + a slightly larger value. */
  hero?: boolean;
  /** Amber glow + primary accent at the normal value size — an "attention" state. */
  glow?: boolean;
  /** Extra grid/positioning classes (e.g. `col-span-2`). */
  className?: string;
};

export function StatCard({
  label,
  value,
  icon: Icon,
  sub,
  href,
  tone = "default",
  trend,
  hero,
  glow,
  className,
}: StatCardProps) {
  const highlight = hero || glow;
  const t = TONE[highlight ? "primary" : tone];

  const trendPositive = trend
    ? trend.goodWhenUp === false
      ? trend.value < 0
      : trend.value >= 0
    : false;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              t.chip,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>

      <div
        className={cn(
          "mt-2 font-bold tracking-tight tabular-nums",
          hero ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl",
          t.value,
        )}
      >
        {value}
      </div>

      {(sub || trend) && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {sub ? (
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {sub}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          {trend && trend.value !== 0 && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium tabular-nums",
                trendPositive ? "text-[hsl(151_70%_55%)]" : "text-destructive",
              )}
            >
              {trend.value >= 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {trend.value >= 0 ? "+" : ""}
              {trend.value}
              {trend.suffix ?? ""}
            </span>
          )}
        </div>
      )}
    </>
  );

  const surface = cn(
    "rounded-xl border bg-card p-4 transition-colors",
    highlight ? "border-primary/30 glow-amber" : "border-border",
    href && cn("block", t.hover, "hover:bg-secondary/20"),
    className,
  );

  return href ? (
    <Link href={href} className={surface}>
      {body}
    </Link>
  ) : (
    <div className={surface}>{body}</div>
  );
}
