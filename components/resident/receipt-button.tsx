"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PAYMENT_MODE } from "@/types";

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
  /** This chunk only — what the resident paid in this transaction. */
  amount: number;
  notes?: string | null;
  /** Total paid against the invoice INCLUDING this chunk. */
  total_paid_so_far?: number | null;
  /** Remaining due after this chunk; <=0 means cleared. */
  still_due?: number | null;
  /** Full invoice amount for context. */
  invoice_amount?: number | null;
  /**
   * Snapshot of the committee officer who collected the cash. Null for
   * super_admin-recorded or legacy rows — the receipt skips the line when
   * absent rather than rendering a hyphen.
   */
  received_by_name?: string | null;
  /** Position label at receipt time (e.g. "President"). Optional alongside name. */
  received_by_position?: string | null;
};

const MODE_LABEL: Record<string, string> = {
  [PAYMENT_MODE.CASH]: "Cash",
  [PAYMENT_MODE.BANK]: "Bank transfer",
  [PAYMENT_MODE.ONLINE]: "Online",
  [PAYMENT_MODE.CHEQUE]: "Cheque",
  [PAYMENT_MODE.CREDIT_CARRYFORWARD]: "Credit (from previous overpayment)",
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

  const friendlyMode = MODE_LABEL[d.payment_mode ?? ""] ?? d.payment_mode ?? "-";
  const isCarryForward = d.payment_mode === PAYMENT_MODE.CREDIT_CARRYFORWARD;

  // "Received by" goes between Payment Mode and Reference No to mirror the
  // admin receipt builder. We omit the row entirely when the receiver
  // snapshot is null so we never render a bare hyphen for the most
  // important transparency field.
  const receivedByLine = d.received_by_name
    ? d.received_by_position
      ? `${d.received_by_name} (${d.received_by_position})`
      : d.received_by_name
    : null;

  const rows: [string, string][] = [
    ["Resident", d.resident_name ?? "-"],
    ["Flat Number", d.flat_number],
    ["Invoice No", d.invoice_number ?? "-"],
    ["Billing Month", d.billing_month ? formatDate(d.billing_month) : "-"],
    ["Payment Mode", friendlyMode],
    ...(receivedByLine ? [["Received by", receivedByLine] as [string, string]] : []),
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

  // Running-balance breakdown panel — the senior-friendly part. Order is
  // invoice total → total paid → still due → paid now, so the resident's eye
  // reads it like a bill statement: here's what was owed, what's been paid,
  // what's left, and what this specific receipt covers.
  let cursorY = endY + 28;

  if (d.invoice_amount != null) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Invoice total", 40, cursorY);
    doc.text(
      formatCurrency(Number(d.invoice_amount)),
      w - 40,
      cursorY,
      { align: "right" },
    );
    cursorY += 16;
  }

  if (typeof d.total_paid_so_far === "number" && d.total_paid_so_far !== null) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Total paid so far (this invoice)", 40, cursorY);
    doc.text(
      formatCurrency(Number(d.total_paid_so_far)),
      w - 40,
      cursorY,
      { align: "right" },
    );
    cursorY += 16;
  }

  if (typeof d.still_due === "number") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const cleared = Number(d.still_due) <= 0;
    if (cleared) {
      doc.setTextColor(20, 130, 80);
      doc.text("Cleared", 40, cursorY);
      doc.text("Rs. 0", w - 40, cursorY, { align: "right" });
    } else {
      doc.setTextColor(200, 30, 30);
      doc.text("Still due", 40, cursorY);
      doc.text(formatCurrency(Number(d.still_due)), w - 40, cursorY, { align: "right" });
    }
    doc.setTextColor(0, 0, 0);
    cursorY += 18;
  }

  // Paid now — the chunk this receipt actually records. Rendered last and
  // largest so it remains the headline number on the page.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Paid now", 40, cursorY);
  doc.setFontSize(18);
  doc.text(formatCurrency(d.amount), w - 40, cursorY, { align: "right" });
  cursorY += 22;

  if (isCarryForward) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(120, 80, 40);
    doc.text("This payment was applied from a previous overpayment.", 40, cursorY);
    doc.setTextColor(0, 0, 0);
    cursorY += 14;
  }

  if (d.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Notes: ${d.notes}`, 40, cursorY);
  }

  const footY = doc.internal.pageSize.getHeight() - 80;
  doc.setDrawColor(150);
  doc.line(40, footY, 200, footY);
  doc.line(w - 200, footY, w - 40, footY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  // Footer labels the two hand-signature lines. The left line is where
  // the resident signs to acknowledge receipt of this PDF copy — calling
  // it "Recipient signature" avoids clashing with the body's "Received by"
  // field which already names the committee officer who collected the cash.
  doc.text("Recipient signature", 40, footY + 14);
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
