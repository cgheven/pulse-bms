// Pulse BMS — PDF exporter shared across all reports.
//
// Design:
//  - Clean white document — no dark fills, no grid lines, no alternating rows.
//  - Horizontal rules only: separator under column headers + thin row dividers.
//  - Typography: large bold title → building name → muted meta line.
//  - Special rows (Opening Balance, Total, Closing Balance) use fill + weight.
//  - Landscape A4, lazy-imported so jspdf stays out of the initial bundle.

import type { ReportColumn } from "./types";

export type PdfMeta = {
  title: string;
  buildingName: string;
  period: string;
  filtersLine?: string;
  filename: string;
};

// ── Colour palette (RGB tuples) ───────────────────────────────────────────────
type RGB = [number, number, number];
const C: Record<string, RGB> = {
  ink:         [15,  23,  42],
  body:        [30,  30,  40],
  muted:       [100, 100, 110],
  label:       [110, 110, 120],
  rule:        [215, 215, 222],
  headerRule:  [155, 155, 170],
  accent:      [15,  23,  42],
  openingFill: [240, 245, 255],
  openingRule: [185, 210, 240],
  totalFill:   [245, 245, 248],
  totalRule:   [70,  70,  85],
  closingFill: [225, 234, 255],
  closingRule: [95,  115, 185],
  white:       [255, 255, 255],
};

type PerSideLW = { top: number; right: number; bottom: number; left: number };
function lw(t: number, r: number, b: number, l: number): PerSideLW {
  return { top: t, right: r, bottom: b, left: l };
}

export async function downloadReportPdf<Row>(opts: {
  meta: PdfMeta;
  columns: ReportColumn<Row>[];
  rows: Row[];
  totalsRow?: boolean;
  pinnedTopRow?: (string | number)[];
  pinnedBottomRow?: (string | number)[];
}): Promise<void> {
  const { meta, columns, rows, totalsRow = true, pinnedTopRow, pinnedBottomRow } = opts;

  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const L = 14;
  const R = pageW - 14;

  // ── Page header ─────────────────────────────────────────────────────────────
  const generated = new Date().toLocaleString("en-PK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const drawHeader = () => {
    doc.setFillColor(...C.accent);
    doc.rect(0, 0, pageW, 2.5, "F");

    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.ink);
    doc.text(meta.title, L, 16);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.muted);
    doc.text(meta.buildingName, L, 22);

    const metaParts = [meta.period, meta.filtersLine, `Generated: ${generated}`]
      .filter(Boolean) as string[];
    doc.setFontSize(7.5);
    doc.text(metaParts.join("   ·   "), L, 27.5);

    doc.setDrawColor(...C.rule);
    doc.setLineWidth(0.3);
    doc.line(L, 30, R, 30);

    doc.setTextColor(...C.body);
  };

  drawHeader();

  // ── Build body rows ──────────────────────────────────────────────────────────
  const fmtNum = (v: string | number) =>
    typeof v === "number" ? new Intl.NumberFormat("en-PK").format(v) : v;

  const openingIdx = pinnedTopRow ? 0 : -1;
  const body: (string | number)[][] = [];

  if (pinnedTopRow) body.push(pinnedTopRow.map(fmtNum));

  rows.forEach((r) => body.push(columns.map((c) => fmtNum(c.accessor(r)))));

  if (totalsRow) {
    body.push(
      columns.map((c, idx) => {
        if (!c.numeric) return idx === 0 ? "Total" : "";
        const sum = rows.reduce((acc, r) => {
          const v = c.accessor(r);
          return acc + (typeof v === "number" ? v : Number(v) || 0);
        }, 0);
        return new Intl.NumberFormat("en-PK").format(sum);
      }),
    );
  }

  const totalsIdx = totalsRow ? body.length - 1 : -1;
  if (pinnedBottomRow) body.push(pinnedBottomRow.map(fmtNum));
  const closingIdx = pinnedBottomRow ? body.length - 1 : -1;

  // ── Table styles (built outside the literal so we can cast lineWidth) ────────
  // jspdf-autotable accepts per-side lineWidth at runtime even though the type
  // only declares `number`. We cast after construction to satisfy TS.
  type AnyStyle = Record<string, unknown>;

  const baseStyles: AnyStyle = {
    fontSize: 8.5,
    cellPadding: { top: 3.5, right: 4, bottom: 3.5, left: 4 },
    textColor: C.body,
    lineColor: C.rule,
    font: "helvetica",
    fontStyle: "normal",
    lineWidth: lw(0, 0, 0.15, 0),
  };

  const hStyles: AnyStyle = {
    fillColor: C.white,
    textColor: C.label,
    fontStyle: "bold",
    fontSize: 7,
    cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
    lineColor: C.headerRule,
    lineWidth: lw(0, 0, 0.5, 0),
  };

  const altStyles: AnyStyle = { fillColor: C.white, lineWidth: lw(0, 0, 0.15, 0) };

  // ── Render ───────────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: 34,
    head: [columns.map((c) => c.label.toUpperCase())],
    body,
    styles:             baseStyles as Parameters<typeof autoTable>[1]["styles"],
    headStyles:         hStyles    as Parameters<typeof autoTable>[1]["headStyles"],
    alternateRowStyles: altStyles  as Parameters<typeof autoTable>[1]["alternateRowStyles"],

    columnStyles: columns.reduce<
      Record<number, { halign?: "right" | "left"; cellWidth?: number }>
    >((acc, c, idx) => {
      acc[idx] = {
        ...(c.numeric ? { halign: "right" as const } : {}),
        ...(c.widthMm ? { cellWidth: c.widthMm } : {}),
      };
      return acc;
    }, {}),

    didParseCell: (data) => {
      const idx = data.row.index;
      const s = data.cell.styles as unknown as AnyStyle;

      if (idx === openingIdx) {
        s.fontStyle  = "bold";
        s.fillColor  = C.openingFill;
        s.lineWidth  = lw(0, 0, 0.5, 0);
        s.lineColor  = C.openingRule;
      }
      if (idx === totalsIdx) {
        s.fontStyle  = "bold";
        s.fillColor  = C.totalFill;
        s.lineWidth  = lw(0.6, 0, 0, 0);
        s.lineColor  = C.totalRule;
      }
      if (idx === closingIdx) {
        s.fontStyle  = "bold";
        s.fillColor  = C.closingFill;
        s.lineWidth  = lw(0.6, 0, 0, 0);
        s.lineColor  = C.closingRule;
      }
    },

    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawHeader();
    },

    margin: { left: L, right: 14, top: 34, bottom: 14 },
  });

  doc.save(`${meta.filename}.pdf`);
}
