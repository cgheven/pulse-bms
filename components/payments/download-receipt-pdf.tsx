"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { amountInWords } from "@/lib/amount-in-words";
import { formatCurrency, formatReceiptNo } from "@/lib/utils";
import type { ReceiptCardProps } from "@/components/payments/receipt-card";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank Transfer",
  bank_transfer: "Bank Transfer",
  online: "Online",
  cheque: "Cheque",
  credit_carryforward: "Credit (from previous payment)",
};

function methodLabel(raw: string): string {
  return METHOD_LABEL[raw.toLowerCase()] ?? raw;
}

function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

// Brand primary HSL(38, 92%, 55%) → roughly #F5A623. Used for the top
// stripe and the TOTAL amount. Hardcoded once here so we don't have to
// resolve a CSS variable from inside jsPDF.
const BRAND_RGB = { r: 245, g: 166, b: 35 };
// Darker brand for TOTAL amount text (matches the HSL(38, 92%, 45%)
// shade used in the HTML card for better contrast on white).
const BRAND_DARK_RGB = { r: 200, g: 130, b: 15 };
// Greens for the PAID pill (Tailwind emerald-500/600/100 family).
const PAID_FILL_RGB = { r: 236, g: 253, b: 245 }; // emerald-50
const PAID_BORDER_RGB = { r: 167, g: 243, b: 208 }; // emerald-200
const PAID_TEXT_RGB = { r: 4, g: 120, b: 87 }; // emerald-700
const PAID_DOT_RGB = { r: 16, g: 185, b: 129 }; // emerald-500

const INK = { r: 17, g: 24, b: 39 }; // slate-900
const HEADING = { r: 15, g: 23, b: 42 }; // slate-900-ish
const MUTED = { r: 75, g: 85, b: 99 }; // gray-600 — darker for B&W print legibility
const SOFT_MUTED = { r: 107, g: 114, b: 128 }; // gray-500
const RULE = { r: 229, g: 231, b: 235 }; // gray-200
const STRONG_RULE = { r: 15, g: 23, b: 42 }; // slate-900
const SOFT_BG = { r: 250, g: 250, b: 250 }; // gray-50

/**
 * Build + save the receipt PDF mirroring the on-screen ReceiptCard.
 *
 * jsPDF is lazy-imported so it stays out of the main bundle. A5 page in
 * mm (148 mm wide × 210 mm tall). All coordinates are mm so the layout
 * is intuitive and stays in lockstep with the HTML's mm-based sizing.
 *
 * The PDF is intentionally a near-pixel match for the HTML card — the
 * brand stripe, receipt card, PAID pill, two-column meta, description
 * row, double-rule TOTAL band, signature block and footer line all
 * appear in the same order and position.
 */
export function DownloadReceiptPdfButton({
  receipt,
  filename,
  label = "Download PDF",
}: {
  receipt: ReceiptCardProps;
  filename: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    setBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a5" });
      const pageW = doc.internal.pageSize.getWidth(); // 148
      const margin = 12;
      const contentW = pageW - margin * 2;
      const rightEdge = pageW - margin;

      // ── 1. Brand accent stripe ────────────────────────────────
      doc.setFillColor(BRAND_RGB.r, BRAND_RGB.g, BRAND_RGB.b);
      doc.rect(0, 0, pageW, 3, "F");

      // ── 2. Header row ─────────────────────────────────────────
      // Left: building name + address + phone
      let y = 13;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(HEADING.r, HEADING.g, HEADING.b);
      doc.text(receipt.building.name, margin, y);

      const addrLine = [receipt.building.address, receipt.building.city]
        .filter(Boolean)
        .join(", ");
      if (addrLine) {
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        const wrapped = doc.splitTextToSize(addrLine, 80);
        doc.text(wrapped, margin, y);
        y += 4 * (wrapped.length - 1);
      }
      if (receipt.building.phone) {
        y += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.text(receipt.building.phone, margin, y);
      }
      if (receipt.building.registration_no) {
        y += 4;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(SOFT_MUTED.r, SOFT_MUTED.g, SOFT_MUTED.b);
        doc.text(receipt.building.registration_no, margin, y);
      }

      // Right: receipt-no card with PAID pill
      const cardW = 46;
      const cardH = 26;
      const cardX = rightEdge - cardW;
      const cardY = 9;
      // Card background + border
      doc.setFillColor(SOFT_BG.r, SOFT_BG.g, SOFT_BG.b);
      doc.setDrawColor(RULE.r, RULE.g, RULE.b);
      doc.setLineWidth(0.2);
      doc.roundedRect(cardX, cardY, cardW, cardH, 2, 2, "FD");

      // RECEIPT label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      doc.text("RECEIPT", rightEdge - 3, cardY + 4.5, { align: "right" });

      // Receipt #
      doc.setFont("courier", "bold");
      doc.setFontSize(14);
      doc.setTextColor(HEADING.r, HEADING.g, HEADING.b);
      const receiptNo = formatReceiptNo(receipt.payment.receipt_no);
      doc.text(`#${receiptNo}`, rightEdge - 3, cardY + 11, { align: "right" });

      // PAID pill — green dot + PAID text. We draw a rounded rect, then
      // a small filled circle inside, then the text.
      const pillH = 4.5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      const pillTextWidth = doc.getTextWidth("PAID");
      const pillW = pillTextWidth + 8; // padding + dot
      const pillX = rightEdge - 3 - pillW;
      const pillY = cardY + 16;
      doc.setFillColor(PAID_FILL_RGB.r, PAID_FILL_RGB.g, PAID_FILL_RGB.b);
      doc.setDrawColor(PAID_BORDER_RGB.r, PAID_BORDER_RGB.g, PAID_BORDER_RGB.b);
      doc.setLineWidth(0.15);
      doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2, pillH / 2, "FD");
      // Dot
      doc.setFillColor(PAID_DOT_RGB.r, PAID_DOT_RGB.g, PAID_DOT_RGB.b);
      doc.circle(pillX + 2, pillY + pillH / 2, 0.7, "F");
      // Text
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(PAID_TEXT_RGB.r, PAID_TEXT_RGB.g, PAID_TEXT_RGB.b);
      doc.text("PAID", pillX + 3.6, pillY + pillH / 2 + 1);

      // ── Divider rule ─────────────────────────────────────────
      let cursor = Math.max(y + 6, cardY + cardH + 4);
      doc.setDrawColor(RULE.r, RULE.g, RULE.b);
      doc.setLineWidth(0.2);
      doc.line(margin, cursor, rightEdge, cursor);
      cursor += 6;

      // ── 3. Two-column meta (BILL TO / PAYMENT DETAILS) ───────
      const colGap = 6;
      const colW = (contentW - colGap) / 2;
      const leftColX = margin;
      const rightColX = margin + colW + colGap;

      // BILL TO label
      drawSectionLabel(doc, "BILL TO", leftColX, cursor);
      // PAYMENT DETAILS label
      drawSectionLabel(doc, "PAYMENT DETAILS", rightColX, cursor);

      let leftY = cursor + 6;
      let rightY = cursor + 6;

      // BILL TO body
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(HEADING.r, HEADING.g, HEADING.b);
      doc.text(receipt.resident.name, leftColX, leftY);
      leftY += 4.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(INK.r, INK.g, INK.b);
      doc.text(`Apartment ${receipt.flat.flat_number}`, leftColX, leftY);
      leftY += 4;
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      doc.text(receipt.building.name, leftColX, leftY);
      leftY += 4;

      // PAYMENT DETAILS body — label/value rows
      rightY = drawMetaRow(doc, "Date", longDate(receipt.payment.payment_date), rightColX, rightY);
      rightY = drawMetaRow(doc, "Method", methodLabel(receipt.payment.method), rightColX, rightY);
      rightY = drawMetaRow(doc, "Reference", receipt.payment.reference ?? "—", rightColX, rightY);

      cursor = Math.max(leftY, rightY) + 4;

      // ── 4. Description table header ──────────────────────────
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      doc.text("DESCRIPTION", margin, cursor);
      doc.text("AMOUNT", rightEdge, cursor, { align: "right" });
      cursor += 1.5;
      doc.setDrawColor(RULE.r, RULE.g, RULE.b);
      doc.setLineWidth(0.2);
      doc.line(margin, cursor, rightEdge, cursor);
      cursor += 4;

      // Description body
      const purpose = receipt.invoice
        ? receipt.invoice.purpose
        : receipt.payment.reference
          ? "Miscellaneous"
          : "Service charges";
      const period = receipt.invoice?.period_label ?? null;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(HEADING.r, HEADING.g, HEADING.b);
      doc.text(purpose, margin, cursor);

      // Amount on the same baseline (right-aligned)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(HEADING.r, HEADING.g, HEADING.b);
      doc.text(formatCurrency(receipt.payment.amount), rightEdge, cursor, {
        align: "right",
      });

      if (period) {
        cursor += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.text(`Period: ${period}`, margin, cursor);
      }
      if (receipt.payment.reference && receipt.invoice) {
        cursor += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        const noteLines = doc.splitTextToSize(
          `Note: ${receipt.payment.reference}`,
          contentW - 4,
        );
        doc.text(noteLines, margin, cursor);
        cursor += 4 * (noteLines.length - 1);
      }

      cursor += 8;

      // ── 5. TOTAL band (double rule) ──────────────────────────
      doc.setDrawColor(STRONG_RULE.r, STRONG_RULE.g, STRONG_RULE.b);
      doc.setLineWidth(0.5);
      doc.line(margin, cursor, rightEdge, cursor);
      cursor += 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(HEADING.r, HEADING.g, HEADING.b);
      doc.text("TOTAL PAID", margin, cursor);
      // Amount in solid black so B&W printouts read crisp.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(HEADING.r, HEADING.g, HEADING.b);
      doc.text(formatCurrency(receipt.payment.amount), rightEdge, cursor, {
        align: "right",
      });
      cursor += 3;
      doc.setDrawColor(STRONG_RULE.r, STRONG_RULE.g, STRONG_RULE.b);
      doc.setLineWidth(0.5);
      doc.line(margin, cursor, rightEdge, cursor);
      cursor += 6;

      // ── 6. Amount in words ───────────────────────────────────
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      const words = amountInWords(receipt.payment.amount);
      const wordsLines = doc.splitTextToSize(
        `Amount in words: ${words}`,
        contentW,
      );
      doc.text(wordsLines, margin, cursor);
      cursor += 4.5 * wordsLines.length;

      // ── 7. Signature block ───────────────────────────────────
      // Push signature ~22mm below the words to mimic the HTML spacing.
      cursor += 22;
      const sigW = 55;
      const sigX = rightEdge - sigW;
      doc.setDrawColor(55, 65, 81); // gray-700
      doc.setLineWidth(0.3);
      doc.line(sigX, cursor, rightEdge, cursor);
      cursor += 4;

      const signerName = receipt.payment.received_by_name ?? "";
      const signerRole = receipt.payment.received_by_position ?? "Authorized Signatory";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(HEADING.r, HEADING.g, HEADING.b);
      doc.text(signerName || "Authorized Signatory", sigX, cursor);
      cursor += 3.5;
      if (signerName) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.text(signerRole, sigX, cursor);
        cursor += 3.5;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      doc.text(longDate(receipt.payment.payment_date), sigX, cursor);

      // ── 8. Footer ────────────────────────────────────────────
      const pageH = doc.internal.pageSize.getHeight();
      const footerY = pageH - 18;
      doc.setDrawColor(RULE.r, RULE.g, RULE.b);
      doc.setLineWidth(0.2);
      doc.line(margin, footerY, rightEdge, footerY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      const terms =
        "Terms · Cheque payments subject to realisation · Bounced cheque may entail legal action · Not a Dues Clearance / No Dues Certificate — such certificates are issued separately on request.";
      const termsLines = doc.splitTextToSize(terms, contentW);
      doc.text(termsLines, margin, footerY + 4);

      let brandFooterY = footerY + 4 + 3 * termsLines.length;
      if (receipt.payment.legacy_receipt_no) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(SOFT_MUTED.r, SOFT_MUTED.g, SOFT_MUTED.b);
        doc.text(
          `Legacy reference: ${receipt.payment.legacy_receipt_no}`,
          margin,
          brandFooterY,
        );
        brandFooterY += 3.5;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(SOFT_MUTED.r, SOFT_MUTED.g, SOFT_MUTED.b);
      doc.text(
        `Generated by Pulse BMS · receipt #${receiptNo}`,
        pageW / 2,
        brandFooterY,
        { align: "center" },
      );

      doc.save(filename);
    } catch (err) {
      console.error("Failed to build receipt PDF", err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button onClick={onClick} disabled={busy} variant="outline">
      <Download className="w-4 h-4 mr-2" />
      {busy ? "Building..." : label}
    </Button>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

// jsPDF doesn't export a clean instance type for tree-shaken consumers,
// so we use a small structural type matching the methods we call. This
// keeps the helpers strict-typed without pulling jsPDF into the main
// bundle (the actual class is lazy-imported in onClick above).
type JsPdf = {
  setFont: (name: string, style?: string) => unknown;
  setFontSize: (size: number) => unknown;
  setTextColor: (r: number, g: number, b: number) => unknown;
  setDrawColor: (r: number, g: number, b: number) => unknown;
  setLineWidth: (w: number) => unknown;
  text: (
    text: string | string[],
    x: number,
    y: number,
    opts?: { align?: "left" | "center" | "right" },
  ) => unknown;
  line: (x1: number, y1: number, x2: number, y2: number) => unknown;
};

function drawSectionLabel(doc: JsPdf, label: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text(label, x, y);
  // Underline rule
  doc.setDrawColor(RULE.r, RULE.g, RULE.b);
  doc.setLineWidth(0.2);
  doc.line(x, y + 1.5, x + 30, y + 1.5);
}

/**
 * Draw a label/value row inside the PAYMENT DETAILS column. Returns
 * the new y cursor so the caller can chain calls.
 */
function drawMetaRow(
  doc: JsPdf,
  label: string,
  value: string,
  x: number,
  y: number,
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text(`${label}:`, x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(INK.r, INK.g, INK.b);
  doc.text(value, x + 20, y);
  return y + 4.5;
}
