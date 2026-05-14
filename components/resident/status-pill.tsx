import { cn } from "@/lib/utils";

// Dark-theme HSL tokens — translucent fill + tinted text + faint border.
// One palette per semantic group (success/warning/danger/info/muted) reused
// across statuses so residents learn the colors once.
const SUCCESS = "bg-[hsl(151_70%_55%/0.12)] text-[hsl(151_70%_55%)] border-[hsl(151_70%_55%/0.30)]";
const WARNING = "bg-[hsl(38_92%_55%/0.12)] text-[hsl(38_92%_65%)] border-[hsl(38_92%_55%/0.30)]";
const DANGER  = "bg-destructive/15 text-destructive border-destructive/30";
const INFO    = "bg-[hsl(210_90%_60%/0.12)] text-[hsl(210_90%_70%)] border-[hsl(210_90%_60%/0.30)]";
const MUTED   = "bg-muted/40 text-muted-foreground border-border";

const LABELS: Record<string, { label: string; cls: string }> = {
  paid:        { label: "Paid",         cls: SUCCESS },
  pending:     { label: "Pending",      cls: WARNING },
  overdue:     { label: "Overdue",      cls: DANGER },
  partial:     { label: "Part-Paid",    cls: WARNING },
  waived:      { label: "Waived",       cls: MUTED },
  open:        { label: "Open",         cls: WARNING },
  in_progress: { label: "In Progress",  cls: INFO },
  resolved:    { label: "Resolved",     cls: SUCCESS },
  closed:      { label: "Closed",       cls: MUTED },
};

export function StatusPill({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const key = (status ?? "default").toLowerCase();
  const cfg = LABELS[key];
  const label = cfg?.label ?? (status ? status[0].toUpperCase() + status.slice(1) : "Unknown");
  const cls = cfg?.cls ?? INFO;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider whitespace-nowrap",
        cls,
        className,
      )}
    >
      {label}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: string | null | undefined }) {
  const p = (priority ?? "normal").toLowerCase();
  const map: Record<string, string> = {
    low:    MUTED,
    normal: INFO,
    high:   WARNING,
    urgent: DANGER,
  };
  const cls = map[p] ?? INFO;
  const label = p[0].toUpperCase() + p.slice(1);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        cls,
      )}
    >
      {label}
    </span>
  );
}
