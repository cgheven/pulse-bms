import { cn } from "@/lib/utils";

type StatusKind = "paid" | "pending" | "overdue" | "partial" | "waived" | "info" | "default";

const LABELS: Record<string, { label: string; cls: string }> = {
  paid:     { label: "Paid",      cls: "status-paid" },
  pending:  { label: "Pending",   cls: "status-pending" },
  overdue:  { label: "Overdue",   cls: "status-overdue" },
  partial:  { label: "Part-Paid", cls: "status-pending" },
  waived:   { label: "Waived",    cls: "status-info" },
  open:     { label: "Open",      cls: "status-overdue" },
  in_progress: { label: "In Progress", cls: "status-pending" },
  resolved: { label: "Resolved",  cls: "status-paid" },
  closed:   { label: "Closed",    cls: "status-info" },
};

export function StatusPill({ status, className }: { status: string | null | undefined; className?: string }) {
  const key = (status ?? "default").toLowerCase();
  const cfg = LABELS[key];
  const label = cfg?.label ?? (status ? status[0].toUpperCase() + status.slice(1) : "Unknown");
  const cls = cfg?.cls ?? "status-info";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap",
        cls,
        className
      )}
    >
      {label}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: string | null | undefined }) {
  const p = (priority ?? "normal").toLowerCase();
  const map: Record<string, string> = {
    low:    "status-info",
    normal: "status-info",
    high:   "status-pending",
    urgent: "status-overdue",
  };
  const cls = map[p] ?? "status-info";
  const label = p[0].toUpperCase() + p.slice(1);
  return (
    <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold", cls)}>
      {label}
    </span>
  );
}
