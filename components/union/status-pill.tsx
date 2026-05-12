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

const CLASSES: Record<ProposalStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border border-amber-300",
  approved: "bg-green-100 text-green-800 border border-green-300",
  rejected: "bg-red-100 text-red-800 border border-red-300",
  executed: "bg-blue-100 text-blue-800 border border-blue-300",
  cancelled: "bg-gray-200 text-gray-700 border border-gray-300",
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
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold",
        CLASSES[key],
        className
      )}
    >
      {LABELS[key]}
    </span>
  );
}
