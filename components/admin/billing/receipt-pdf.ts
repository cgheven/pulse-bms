"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency, formatDate } from "@/lib/utils";

export type ReceiptInput = {
  receipt_no: string;
  payment_date: string | null;
  building_name: string;
  flat_number: string;
  resident_name: string | null;
  amount: number;
  payment_mode: string | null;
  reference_no: string | null;
  category: string | null;
  invoice_number?: string | null;
  billing_month?: string | null;
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

  autoTable(doc, {
    startY: 50,
    head: [["Field", "Value"]],
    body: [
      ["Flat", r.flat_number],
      ["Resident", r.resident_name ?? "—"],
      ["Category", r.category ?? "maintenance"],
      ["Payment mode", r.payment_mode ?? "cash"],
      ["Reference #", r.reference_no ?? "—"],
      ...(r.invoice_number ? [["Invoice #", r.invoice_number]] : []),
      ...(r.billing_month ? [["Billing month", formatDate(r.billing_month)]] : []),
      ["Amount", formatCurrency(r.amount)],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [30, 58, 138] },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 90 } },
  });

  // @ts-expect-error jspdf-autotable adds lastAutoTable
  const finalY = doc.lastAutoTable?.finalY ?? 120;
  doc.setFontSize(9);
  doc.text(
    "This is a system-generated receipt. Thank you for your payment.",
    14,
    finalY + 12,
  );

  doc.save(`receipt-${r.receipt_no}.pdf`);
}
