"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PAYMENT_MODE } from "@/types";

export type ReceiptInput = {
  receipt_no: string;
  payment_date: string | null;
  building_name: string;
  flat_number: string;
  resident_name: string | null;
  /** This chunk only — what the resident paid right now. */
  amount: number;
  payment_mode: string | null;
  reference_no: string | null;
  category: string | null;
  invoice_number?: string | null;
  billing_month?: string | null;
  /** Total paid against THIS invoice so far (this chunk + earlier chunks). */
  total_paid_so_far?: number | null;
  /** Remaining due after this chunk (invoice amount minus total_paid_so_far). */
  still_due?: number | null;
  /** Full invoice amount, shown alongside the running balance for context. */
  invoice_amount?: number | null;
  /**
   * Snapshot of the committee officer who physically received the cash.
   * Null for super_admin-recorded payments or legacy rows — in which case
   * the receipt omits the "Received by" line entirely.
   */
  received_by_name?: string | null;
  /** Position label at time of receipt — e.g. "President", "Treasurer". */
  received_by_position?: string | null;
};

const MODE_LABEL: Record<string, string> = {
  [PAYMENT_MODE.CASH]: "Cash",
  [PAYMENT_MODE.BANK]: "Bank transfer",
  [PAYMENT_MODE.ONLINE]: "Online",
  [PAYMENT_MODE.CHEQUE]: "Cheque",
  [PAYMENT_MODE.CREDIT_CARRYFORWARD]: "Credit (from previous overpayment)",
};

export function downloadReceiptPdf(r: ReceiptInput) {
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  doc.setFontSize(18);
  doc.text("Payment Receipt", 14, 18);
  doc.setFontSize(11);
  doc.text(r.building_name, 14, 26);

  doc.setFontSize(10);
  doc.text(`Receipt #: ${r.receipt_no}`, 14, 36);
  doc.text(`Date: ${r.payment_date ? formatDate(r.payment_date) : "—"}`, 14, 42);

  const friendlyMode = MODE_LABEL[r.payment_mode ?? ""] ?? r.payment_mode ?? "cash";
  const isCarryForward =
    r.payment_mode === PAYMENT_MODE.CREDIT_CARRYFORWARD || friendlyMode.includes("Credit");

  // "Received by" sits between Payment mode and Reference # so the eye
  // reads it as part of the transaction context: mode of payment, who
  // collected, what reference. Omit the row entirely when there's no
  // receiver snapshot (super_admin / legacy rows) rather than showing "—".
  const receivedByLine =
    r.received_by_name
      ? r.received_by_position
        ? `${r.received_by_name} (${r.received_by_position})`
        : r.received_by_name
      : null;

  autoTable(doc, {
    startY: 50,
    head: [["Field", "Value"]],
    body: [
      ["Flat", r.flat_number],
      ["Resident", r.resident_name ?? "—"],
      ["Category", r.category ?? "maintenance"],
      ["Payment mode", friendlyMode],
      ...(receivedByLine ? [["Received by", receivedByLine]] : []),
      ["Reference #", r.reference_no ?? "—"],
      ...(r.invoice_number ? [["Invoice #", r.invoice_number]] : []),
      ...(r.billing_month ? [["Billing month", formatDate(r.billing_month)]] : []),
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [30, 58, 138] },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 90 } },
  });

  // @ts-expect-error jspdf-autotable adds lastAutoTable
  let cursorY = (doc.lastAutoTable?.finalY ?? 120) + 8;

  // Running balance breakdown — the core senior-friendly feature.
  // Order matters for the eye-scan: invoice total → paid → still due.
  // Resident reads it like a bill: "this is what was owed → here's what's
  // been paid → here's what's left". "Paid now" is the chunk shown in the
  // header anyway, so we lead with the full-invoice context.
  doc.setFontSize(11);
  if (r.invoice_amount != null) {
    doc.setFont("helvetica", "normal");
    doc.text("Invoice total:", 14, cursorY);
    doc.text(formatCurrency(Number(r.invoice_amount)), 90, cursorY);
    cursorY += 6;
  }

  const hasRunningBalance =
    typeof r.total_paid_so_far === "number" && r.total_paid_so_far !== null;
  if (hasRunningBalance) {
    doc.setFont("helvetica", "normal");
    doc.text("Total paid so far:", 14, cursorY);
    doc.text(formatCurrency(Number(r.total_paid_so_far)), 90, cursorY);
    cursorY += 6;
  }
  if (typeof r.still_due === "number") {
    doc.setFont("helvetica", "bold");
    if (Number(r.still_due) <= 0) {
      doc.setTextColor(20, 130, 80);
      doc.text("Cleared", 14, cursorY);
      doc.text("Rs. 0", 90, cursorY);
    } else {
      doc.setTextColor(200, 30, 30);
      doc.text("Still due:", 14, cursorY);
      doc.text(formatCurrency(Number(r.still_due)), 90, cursorY);
    }
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    cursorY += 6;
  }

  // "Paid now" closes the breakdown — it's the receipt of this transaction.
  doc.setFont("helvetica", "bold");
  doc.text("Paid now:", 14, cursorY);
  doc.setFont("helvetica", "normal");
  doc.text(formatCurrency(r.amount), 90, cursorY);
  cursorY += 6;

  if (isCarryForward) {
    cursorY += 2;
    doc.setFontSize(9);
    doc.setTextColor(120, 80, 40);
    doc.text("From previous overpayment.", 14, cursorY);
    doc.setTextColor(0, 0, 0);
    cursorY += 6;
  }

  doc.setFontSize(9);
  doc.text(
    "This is a system-generated receipt. Thank you for your payment.",
    14,
    cursorY + 6,
  );

  doc.save(`receipt-${r.receipt_no}.pdf`);
}
