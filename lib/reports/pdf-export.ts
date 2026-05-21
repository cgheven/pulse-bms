// Pulse BMS — PDF exporter shared across all 5 reports.
//
// Lazy-imports jspdf + jspdf-autotable on click so they stay out of the
// initial bundle for /admin/reports.
// Landscape A4. Title + building name + period + filters at the top,
// then the body table, then a totals row.

import type { ReportColumn } from "./types";

export type PdfMeta = {
  title: string;
  buildingName: string;
  period: string;
  /** Optional filter chips shown under the period (e.g. "Bank: HBL Main"). */
  filtersLine?: string;
  /** Filename WITHOUT extension. */
  filename: string;
};

export async function downloadReportPdf<Row>(opts: {
  meta: PdfMeta;
  columns: ReportColumn<Row>[];
  rows: Row[];
  /** Append totals row at the bottom of the table. */
  totalsRow?: boolean;
}): Promise<void> {
  const { meta, columns, rows, totalsRow = true } = opts;

  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightEdge = pageWidth - 14;

  // Premium B&W look — designed to print cleanly on plain paper and look
  // good in an auditor's binder. No accent colors. Grayscale only.

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

  // Header block — drawn on EVERY page via the autotable didDrawPage hook
  // below so multi-page reports always identify themselves at the top.
  const drawHeader = () => {
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    doc.text(meta.title, 14, 17);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(meta.buildingName, 14, 24);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(metaLine, 14, 30);

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.line(14, 33, rightEdge, 33);

    doc.setTextColor(0, 0, 0);
  };

  drawHeader();

  const body: (string | number)[][] = rows.map((r) =>
    columns.map((c) => {
      const v = c.accessor(r);
      return typeof v === "number"
        ? new Intl.NumberFormat("en-PK").format(v)
        : v;
    }),
  );

  if (totalsRow) {
    const totals = columns.map((c, idx) => {
      if (!c.numeric) return idx === 0 ? "Total" : "";
      const sum = rows.reduce((acc, r) => {
        const v = c.accessor(r);
        const n = typeof v === "number" ? v : Number(v) || 0;
        return acc + n;
      }, 0);
      return new Intl.NumberFormat("en-PK").format(sum);
    });
    body.push(totals);
  }

  autoTable(doc, {
    startY: 37,
    head: [columns.map((c) => c.label)],
    body,
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
      textColor: [30, 30, 30],
    },
    headStyles: {
      fillColor: [40, 40, 40],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      cellPadding: 3.5,
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: columns.reduce<Record<number, { halign?: "right" | "left" | "center"; cellWidth?: number }>>(
      (acc, c, idx) => {
        acc[idx] = {
          ...(c.numeric ? { halign: "right" } : {}),
          ...(c.widthMm ? { cellWidth: c.widthMm } : {}),
        };
        return acc;
      },
      {},
    ),
    didParseCell: (data) => {
      // Totals row: bold + light gray fill + thicker top border for accountant-style underline
      if (totalsRow && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [238, 238, 238];
        // Cast — jspdf-autotable accepts per-side line widths at runtime even
        // though the typed signature only declares a single number.
        (data.cell.styles as unknown as { lineWidth: unknown }).lineWidth = {
          top: 0.5,
          right: 0.1,
          bottom: 0.1,
          left: 0.1,
        };
        data.cell.styles.lineColor = [100, 100, 100];
      }
    },
    // Redraw header on every page so multi-page reports always identify
    // themselves at the top — auditor flipping pages always sees title,
    // building, period, generated timestamp.
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawHeader();
    },
    margin: { left: 14, right: 14, top: 37, bottom: 14 },
  });

  doc.save(`${meta.filename}.pdf`);
}
