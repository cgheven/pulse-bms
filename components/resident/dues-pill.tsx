import { uiStatusFor } from "@/lib/billing-status";
import { cn } from "@/lib/utils";

// Dark-theme tokens reused from status-pill.tsx to keep the resident UI
// consistent across "Cleared" / "Still due" / "Waived".
const SUCCESS =
  "bg-[hsl(151_70%_55%/0.12)] text-[hsl(151_70%_55%)] border-[hsl(151_70%_55%/0.30)]";
const DANGER = "bg-destructive/15 text-destructive border-destructive/30";
const MUTED = "bg-muted/40 text-muted-foreground border-border";

/**
 * Two-state dues pill for resident-facing surfaces (dues page, dashboard).
 *
 * The product rules (CLAUDE.md) ban the words "Partial" and "Pending" from
 * every user-facing surface — chowkidars and senior committee members find
 * them confusing. We render only:
 *   - "Cleared ✓"               when amount_due <= 0
 *   - "Rs. X,XXX still due"     when amount_due >  0
 *   - "Waived"                  when admin pardoned the invoice
 *
 * The DB enum keeps {pending|partial|paid|overdue|waived} for filtering.
 */
export function DuesPill({
  status,
  amount,
  paidTotal,
  className,
}: {
  status: string | null | undefined;
  amount: number;
  paidTotal: number;
  className?: string;
}) {
  if (status === "waived") {
    return <Pill cls={MUTED} className={className} label="Waived" />;
  }
  const ui = uiStatusFor({ amount }, paidTotal);
  if (ui.kind === "cleared") {
    return <Pill cls={SUCCESS} className={className} label="Cleared ✓" />;
  }
  return <Pill cls={DANGER} className={className} label={ui.label} />;
}

function Pill({
  cls,
  label,
  className,
}: {
  cls: string;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap tabular-nums",
        cls,
        className,
      )}
    >
      {label}
    </span>
  );
}
