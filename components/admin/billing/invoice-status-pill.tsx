export function InvoiceStatusPill({
  status,
  due_date,
}: {
  status: string;
  due_date?: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = status === "pending" && due_date && due_date < today;
  const effective = isOverdue ? "overdue" : status;

  const cls: Record<string, string> = {
    paid: "status-paid",
    pending: "status-pending",
    overdue: "status-overdue",
    partial: "status-info",
    waived: "status-paid",
  };

  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
        cls[effective] ?? "status-pending"
      }`}
    >
      {effective}
    </span>
  );
}
