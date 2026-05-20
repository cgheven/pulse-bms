import { uiStatusFor } from "@/lib/billing-status";

/**
 * Human-friendly invoice status pill.
 *
 * Per the senior-friendly UX rules (CLAUDE.md), residents and chowkidars
 * only ever see TWO states:
 *   - "Cleared ✓"               (green, when amount_due <= 0)
 *   - "Rs. X,XXX still due"     (red,   when amount_due >  0)
 *
 * The DB enum keeps {pending|partial|paid|overdue|waived} for filtering;
 * this component takes care of rendering only.
 *
 * Special case: `waived` invoices show a muted "Waived" pill because they
 * are not "cleared" (resident didn't pay) but also not "due" (admin pardoned).
 */
export function InvoiceStatusPill({
  status,
  amount,
  paidTotal,
}: {
  status: string;
  amount: number;
  paidTotal: number;
  /** kept for backwards compat with callers that still pass it */
  due_date?: string | null;
}) {
  if (status === "waived") {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium status-paid opacity-70">
        Waived
      </span>
    );
  }
  const ui = uiStatusFor({ amount }, paidTotal);
  if (ui.kind === "cleared") {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium status-paid">
        Cleared ✓
      </span>
    );
  }
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium status-overdue">
      {ui.label}
    </span>
  );
}
