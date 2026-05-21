// Pulse BMS — Day Book PDF exporter.
//
// Unlike the shared `pdf-export.ts` (one big autotable for tabular
// reports), Day Book is a NARRATIVE per-day journal — "Roznamcha" in
// PK accountant vernacular. Each day is its own block: date header,
// opening balance, income lines, expense lines, closing balance. We
// hand-render with `doc.text()` + page-aware Y tracking so the layout
// stays narrative and isn't squeezed into a grid.
//
// Lazy-imports jspdf so the bundle for /admin/reports stays slim.

import type { DayBookDay } from "@/app/(admin)/admin/reports/day-book/day-book-client";

export type DayBookPdfMeta = {
  title: string;
  buildingName: string;
  period: string;
  filtersLine?: string;
  filename: string;
};

// Format a number as Pakistani-grouped currency string (without the
// "Rs. " prefix — the caller adds it where needed). Matches the spec:
// 1,500,000 grouping.
function fmt(n: number): string {
  return new Intl.NumberFormat("en-PK").format(Math.round(n));
}

export async function downloadDayBookPdf(opts: {
  meta: DayBookPdfMeta;
  days: DayBookDay[];
}): Promise<void> {
  const { meta, days } = opts;

  const { jsPDF } = await import("jspdf");

  // Portrait A4 — Day Book reads better as a "ledger page" portrait
  // shape than the landscape tables used by the other reports.
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = 14;
  const marginBottom = 14;
  const rightX = pageWidth - marginRight;

  const generated = new Date().toLocaleString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const metaParts = [
    `Period: ${meta.period}`,
    meta.filtersLine,
    `Generated: ${generated}`,
  ].filter(Boolean) as string[];
  const metaLine = metaParts.join("  ·  ");

  // Header drawn on EVERY page (page 1 here, subsequent pages via ensureSpace
  // when it calls doc.addPage()). Multi-page Day Books always identify
  // themselves at the top — auditor flipping pages knows what they're reading.
  const HEADER_BOTTOM = 40; // y position right under the header divider
  const drawHeader = () => {
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    doc.text(meta.title, marginLeft, 17);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(meta.buildingName, marginLeft, 24);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(metaLine, marginLeft, 30);

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.line(marginLeft, 33, rightX, 33);

    doc.setTextColor(0, 0, 0);
  };

  drawHeader();
  let y = HEADER_BOTTOM; // running Y cursor

  // --- Helper: ensure `needed` mm of vertical space is available; new
  // page + redraw header + reset Y if not.
  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      drawHeader();
      y = HEADER_BOTTOM;
    }
  };

  // Line height used when wrapping labels with splitTextToSize. 5mm at
  // 9-10pt matches the existing y-advance per row in the loops below.
  const LINE_HEIGHT = 5;
  // Reserve a 30mm gutter on the right for the formatted amount so even
  // long Lakh-scale numbers don't collide with wrapped label text.
  const AMOUNT_GUTTER = 30;

  // --- Helper: draw a right-aligned amount column at `rightX`,
  // left-aligned label at `labelX`. Long labels are wrapped so they
  // never overrun the amount column; the amount stays anchored to the
  // first wrapped line (accountant convention: amount aligns with the
  // *start* of the description, not its middle). Returns the number of
  // wrapped lines so callers can advance `y` correctly.
  const drawLine = (label: string, amount: string, labelX: number): number => {
    const maxLabelWidth = rightX - labelX - AMOUNT_GUTTER;
    const lines = doc.splitTextToSize(label, maxLabelWidth) as string[];
    doc.text(lines, labelX, y);
    doc.text(amount, rightX, y, { align: "right" });
    return lines.length;
  };

  if (days.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text("No activity in this period.", marginLeft, y);
    doc.save(`${meta.filename}.pdf`);
    return;
  }

  for (const day of days) {
    // Empty day → single one-line entry. ~6mm tall.
    if (day.isEmpty) {
      ensureSpace(8);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(
        `${day.label} — No activity · Balance: Rs. ${fmt(day.closing)}`,
        marginLeft,
        y,
      );
      y += 6;
      continue;
    }

    // Estimate the block height so the date header doesn't end up
    // orphaned on the previous page. Components below mirror the
    // y-advance values used in the draw loops further down. We assume
    // single-line labels here — multi-line wrapping inside drawLine()
    // gets per-row `ensureSpace` checks too, so worst-case the block
    // spills cleanly across pages rather than overlapping content.
    const blockHeight =
      6 + // date header
      6 + // opening line
      (day.buildingSeedAmount > 0 ? LINE_HEIGHT + 1 : 0) + // building opening note
      (day.income.length > 0 || day.seedAmount > 0
        ? 5 + day.income.length * LINE_HEIGHT + (day.seedAmount > 0 ? LINE_HEIGHT : 0) + 6
        : 0) +
      (day.expenses.length > 0
        ? 5 + day.expenses.length * LINE_HEIGHT + 6
        : 0) +
      9; // closing + gap

    const pageContentHeight = pageHeight - marginBottom - 17; // top margin on new pages
    if (blockHeight <= pageContentHeight) {
      // Whole block fits on one page — reserve it so the date header
      // travels with its body.
      ensureSpace(blockHeight);
    } else {
      // Block too tall to fit on any single page (long expense lists).
      // Guarantee at least the date header + opening + first section
      // header stick together (≥ 30mm) and let the body flow naturally
      // with per-row ensureSpace checks.
      ensureSpace(30);
    }

    // Date header
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    doc.text(day.label, marginLeft, y);
    y += 6;

    // Opening balance
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    {
      const lines = drawLine(`Opening Balance:`, `Rs. ${fmt(day.opening)}`, marginLeft);
      y += Math.max(6, lines * LINE_HEIGHT + 1);
    }

    // Building-level onboarding opening (one-time seed). Rendered as a
    // muted standalone line so the auditor sees where the closing
    // balance picked up this number — distinct from per-bank seeds.
    if (day.buildingSeedAmount > 0) {
      doc.setFontSize(9.5);
      doc.setTextColor(110, 110, 110);
      const lines = drawLine(
        `Opening balance set:`,
        `Rs. ${fmt(day.buildingSeedAmount)}`,
        marginLeft,
      );
      y += lines * LINE_HEIGHT + 1;
    }

    doc.setTextColor(0, 0, 0);

    // Income section
    if (day.income.length > 0 || day.seedAmount > 0) {
      ensureSpace(8);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      doc.text("Income", marginLeft + 2, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(30, 30, 30);

      for (const line of day.income) {
        const desc = `${line.categoryLabel} (${line.description})${
          line.isCredit ? " — credit applied" : ""
        }`;
        // Reserve worst-case 2-line height so a wrap doesn't cross
        // page boundaries with the amount detached from its label.
        ensureSpace(LINE_HEIGHT * 2 + 1);
        const lines = drawLine(`  ${desc}`, `Rs. ${fmt(line.amount)}`, marginLeft + 4);
        y += lines * LINE_HEIGHT;
      }
      if (day.seedAmount > 0) {
        ensureSpace(LINE_HEIGHT * 2 + 1);
        const lines = drawLine(
          `  Opening cash (bank seed)`,
          `Rs. ${fmt(day.seedAmount)}`,
          marginLeft + 4,
        );
        y += lines * LINE_HEIGHT;
      }

      // Income total (muted, no underline — keeps the page light)
      ensureSpace(6);
      doc.setTextColor(110, 110, 110);
      doc.setFontSize(9);
      {
        const lines = drawLine(
          `  Income total`,
          `Rs. ${fmt(day.realIncomeTotal + day.seedAmount)}`,
          marginLeft + 4,
        );
        y += Math.max(6, lines * LINE_HEIGHT + 1);
      }
      doc.setTextColor(0, 0, 0);
    }

    // Expenses section
    if (day.expenses.length > 0) {
      ensureSpace(8);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      doc.text("Expenses", marginLeft + 2, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(30, 30, 30);

      for (const line of day.expenses) {
        const desc = `${line.categoryLabel} (${line.source})`;
        ensureSpace(LINE_HEIGHT * 2 + 1);
        const lines = drawLine(`  ${desc}`, `Rs. ${fmt(line.amount)}`, marginLeft + 4);
        y += lines * LINE_HEIGHT;
      }

      ensureSpace(6);
      doc.setTextColor(110, 110, 110);
      doc.setFontSize(9);
      {
        const lines = drawLine(
          `  Expense total`,
          `Rs. ${fmt(day.expenseTotal)}`,
          marginLeft + 4,
        );
        y += Math.max(6, lines * LINE_HEIGHT + 1);
      }
      doc.setTextColor(0, 0, 0);
    }

    // Closing balance — thin divider ABOVE, then bold text. Accountant style.
    // The line is drawn at the current y, then y is advanced so the text sits
    // below the line with breathing room (jsPDF text baseline is AT y, glyph
    // top is ~y-3.5 for 10pt → a line at y-2 would cross through the glyphs).
    ensureSpace(12);
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, y, rightX, y);
    y += 6; // gap between divider and the closing-balance text

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    {
      const lines = drawLine(`Closing Balance:`, `Rs. ${fmt(day.closing)}`, marginLeft);
      y += Math.max(9, lines * LINE_HEIGHT + 4); // extra gap before next day's block
    }
  }

  doc.save(`${meta.filename}.pdf`);
}
