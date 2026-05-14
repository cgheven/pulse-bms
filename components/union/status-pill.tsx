import { cn } from "@/lib/utils";

export type ProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "cancelled";

const LABELS: Record<ProposalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  executed: "Executed",
  cancelled: "Cancelled",
};

// Dark-theme tokens — translucent fills, tinted text, low-opacity borders.
// Matches the rest of the SaaS shell (billing pills, P&L hero).
const CLASSES: Record<ProposalStatus, string> = {
  pending:   "bg-[hsl(38_92%_55%/0.12)] text-[hsl(38_92%_65%)] border-[hsl(38_92%_55%/0.30)]",
  approved:  "bg-[hsl(151_70%_55%/0.12)] text-[hsl(151_70%_55%)] border-[hsl(151_70%_55%/0.30)]",
  rejected:  "bg-destructive/15 text-destructive border-destructive/30",
  executed:  "bg-[hsl(210_90%_60%/0.12)] text-[hsl(210_90%_70%)] border-[hsl(210_90%_60%/0.30)]",
  cancelled: "bg-muted/40 text-muted-foreground border-border",
};

export function StatusPill({
  status,
  className,
}: {
  status: ProposalStatus | string;
  className?: string;
}) {
  const key = (status as ProposalStatus) in LABELS ? (status as ProposalStatus) : "pending";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        CLASSES[key],
        className,
      )}
    >
      {LABELS[key]}
    </span>
  );
}
