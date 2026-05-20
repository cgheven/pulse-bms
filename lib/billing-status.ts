import { formatCurrency } from "@/lib/utils";

/**
 * UI status for an invoice in Pulse BMS.
 *
 * Pakistani residents pay in chunks across the month, so the database
 * status enum (`pending | partial | paid | overdue | waived`) is rich
 * but jargon-heavy. We only ever show TWO states to humans:
 *
 *   - "Cleared ✓"               (amount_due <= 0)
 *   - "Rs. X,XXX still due"     (amount_due >  0)
 *
 * Never the words "Partial" or "Pending". The DB layer keeps its enum
 * for filtering / sorting purposes; this helper is the rendering source
 * of truth.
 */
export type InvoiceUiStatus =
  | { kind: "cleared"; label: string; amountDue: 0 }
  | { kind: "due"; label: string; amountDue: number };

/**
 * Derive the user-facing status from raw invoice + payments figures.
 * `totalPaid` is the sum of all payments against the invoice (chunks).
 *
 * Edge cases:
 *   - Waived invoices: callers should short-circuit before calling this
 *     and render "Waived" themselves; we don't model waived here because
 *     a waived invoice still has amount > 0 but should not be "due".
 *   - Overpayments (totalPaid > amount): treated as cleared. The surplus
 *     is tracked separately in bms_flat_credits.
 */
export function uiStatusFor(
  invoice: { amount: number },
  totalPaid: number,
): InvoiceUiStatus {
  const due = Number(invoice.amount) - Number(totalPaid);
  if (due <= 0) {
    return { kind: "cleared", label: "Cleared ✓", amountDue: 0 };
  }
  return {
    kind: "due",
    label: `${formatCurrency(due)} still due`,
    amountDue: due,
  };
}

/**
 * Compact label for tabular contexts (no leading "Rs." duplication when
 * the column header already says "amount"). Same two-state rule.
 */
export function uiStatusLabel(
  invoice: { amount: number },
  totalPaid: number,
): string {
  return uiStatusFor(invoice, totalPaid).label;
}
