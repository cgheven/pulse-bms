"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export type ReceiptData = {
  building_name: string;
  building_address?: string | null;
  building_city?: string | null;
  flat_number: string;
  resident_name?: string | null;
  receipt_no?: string | null;
  invoice_number?: string | null;
  payment_date?: string | null;
  payment_mode?: string | null;
  reference_no?: string | null;
  category?: string | null;
  billing_month?: string | null;
  amount: number;
  notes?: string | null;
};

async function buildReceipt(d: ReceiptData) {
  const { jsPDF } = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(d.building_name, w / 2, 50, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const addr = [d.building_address, d.building_city].filter(Boolean).join(", ");
  if (addr) doc.text(addr, w / 2, 68, { align: "center" });

  doc.setDrawColor(180);
  doc.line(40, 82, w - 40, 82);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("PAYMENT RECEIPT", w / 2, 110, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const lineY = 134;
  doc.text(`Receipt No: ${d.receipt_no ?? "-"}`, 40, lineY);
  doc.text(
    `Date: ${d.payment_date ? formatDate(d.payment_date) : "-"}`,
    w - 40,
    lineY,
    { align: "right" }
  );

  const rows: [string, string][] = [
    ["Resident", d.resident_name ?? "-"],
    ["Flat Number", d.flat_number],
    ["Invoice No", d.invoice_number ?? "-"],
    ["Billing Month", d.billing_month ? formatDate(d.billing_month) : "-"],
    ["Payment Mode", d.payment_mode ?? "-"],
    ["Reference No", d.reference_no ?? "-"],
    ["Category", d.category ?? "Maintenance"],
  ];

  autoTable(doc, {
    startY: 150,
    head: [["Detail", "Value"]],
    body: rows,
    theme: "grid",
    styles: { fontSize: 11, cellPadding: 8 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 160 } },
  });

  const endY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 320;
  const amountY = endY + 32;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Amount Paid", 40, amountY);
  doc.setFontSize(20);
  doc.text(formatCurrency(d.amount), w - 40, amountY, { align: "right" });

  if (d.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Notes: ${d.notes}`, 40, amountY + 28);
  }

  const footY = doc.internal.pageSize.getHeight() - 80;
  doc.setDrawColor(150);
  doc.line(40, footY, 200, footY);
  doc.line(w - 200, footY, w - 40, footY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Received by", 40, footY + 14);
  doc.text("Authorised signature", w - 40, footY + 14, { align: "right" });

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    "This is a computer-generated receipt. Pulse BMS.",
    w / 2,
    doc.internal.pageSize.getHeight() - 30,
    { align: "center" }
  );

  const filename = `Receipt-${d.receipt_no ?? d.flat_number}-${(d.payment_date ?? "").replace(/[^\d-]/g, "")}.pdf`;
  doc.save(filename);
}

export function ReceiptButton({
  data,
  label = "Receipt PDF",
  size = "sm",
}: {
  data: ReceiptData;
  label?: string;
  size?: "sm" | "default" | "lg";
}) {
  return (
    <Button
      variant="outline"
      size={size}
      onClick={() => {
        buildReceipt(data).catch((e) => {
          console.error(e);
          alert("Could not build receipt PDF");
        });
      }}
    >
      <Download className="w-4 h-4 mr-1" />
      {label}
    </Button>
  );
}
