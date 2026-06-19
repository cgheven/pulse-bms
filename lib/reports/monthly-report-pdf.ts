// Pulse BMS — Monthly Financial Report PDF
//
// Portrait A4. Structure:
//   1. Header: accent bar, title, building, period, generated-at.
//   2. KPI summary block: collected / expenses / bills / salaries / net / fund balance.
//   3. Each selected section: heading + autotable (jspdf-autotable handles pagination).
//
// Lazy-imports jspdf / jspdf-autotable so this stays out of the initial bundle.

import type { MonthlyReportData } from "@/app/actions/monthly-report";

const fmtPK = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmtDate = () =>
  new Date().toLocaleString("en-PK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

type RGB = [number, number, number];
const C: Record<string, RGB> = {
  ink:        [15,  23,  42],
  body:       [30,  30,  40],
  muted:      [100, 100, 110],
  rule:       [215, 215, 222],
  headerRule: [155, 155, 170],
  sectionBg:  [245, 246, 250],
  white:      [255, 255, 255],
  totalFill:  [245, 245, 248],
  accent:     [15,  23,  42],
};

type AnyStyle = Record<string, unknown>;
type PerSide = { top: number; right: number; bottom: number; left: number };
const lw = (t: number, r: number, b: number, l: number): PerSide => ({ top: t, right: r, bottom: b, left: l });

const PAGE_W   = 210;   // A4 portrait mm
const MARGIN_L = 14;
const MARGIN_R = 14;
const MARGIN_B = 14;
const COL_W    = PAGE_W - MARGIN_L - MARGIN_R;   // 182mm usable

// Column widths per section (must sum to COL_W = 182)
const colWidths = {
  collections: { date: 22, flat: 18, resident: 42, category: 30, amount: 28, mode: 22, receipt: 20 },
  expenses:    { date: 22, category: 35, description: 65, vendor: 32, amount: 28 },
  bills:       { date: 22, billType: 50, vendor: 60, amount: 28, units: 22 },
  salaries:    { date: 22, staffName: 90, position: 42, amount: 28 },
  projects:    { date: 22, projectName: 110, amount: 28, mode: 22 },
};

export async function downloadMonthlyReportPdf(data: MonthlyReportData): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageH = doc.internal.pageSize.getHeight();

  const generated = fmtDate();
  const periodLabel = `${data.from} – ${data.to}`;

  // ── Header ───────────────────────────────────────────────────────────────────
  const drawHeader = () => {
    doc.setFillColor(...C.accent);
    doc.rect(0, 0, PAGE_W, 2.5, "F");

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.ink);
    doc.text("Monthly Financial Report", MARGIN_L, 15);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.muted);
    doc.text(data.buildingName, MARGIN_L, 21.5);

    doc.setFontSize(8);
    doc.text(`Period: ${periodLabel}   ·   Generated: ${generated}`, MARGIN_L, 27);

    doc.setDrawColor(...C.rule);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_L, 30, PAGE_W - MARGIN_R, 30);
  };

  drawHeader();

  // ── KPI Summary block ─────────────────────────────────────────────────────────
  let y = 38;

  const kpiRows: [string, number, string, number][] = [
    ["Collected",    data.totals.collected,   "Fund Balance", data.fundBalance],
    ["Expenses",     data.totals.expenses,    "Utility Bills",data.totals.bills],
    ["Staff Salaries", data.totals.salaries,  "Net",          data.totals.net],
  ];

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.ink);
  doc.text("SUMMARY", MARGIN_L, y);
  y += 3;

  doc.setDrawColor(...C.headerRule);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_L, y, PAGE_W - MARGIN_R, y);
  y += 5;

  const colMid = PAGE_W / 2;

  for (const [lLabel, lVal, rLabel, rVal] of kpiRows) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.muted);
    doc.text(lLabel, MARGIN_L, y);
    doc.text(rLabel, colMid, y);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.ink);
    const lStr = `Rs. ${fmtPK(lVal)}`;
    const rStr = (lLabel === "Net" || rLabel === "Net")
      ? `${data.totals.net >= 0 ? "+" : ""}Rs. ${fmtPK(data.totals.net)}`
      : `Rs. ${fmtPK(rVal)}`;
    doc.text(lStr, MARGIN_L + 55, y, { align: "right" });
    doc.text(rStr, colMid + 55, y, { align: "right" });
    y += 7;
  }

  y += 2;
  doc.setDrawColor(...C.rule);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_L, y, PAGE_W - MARGIN_R, y);
  y += 8;

  // ── Section renderer ──────────────────────────────────────────────────────────
  function renderSection(
    title: string,
    total: number,
    count: number,
    head: string[],
    body: (string | number)[][],
    widths: number[],
    numericCols: number[],
  ) {
    // Ensure the heading + at least 2 data rows don't get orphaned.
    const spaceNeeded = 22 + Math.min(count, 2) * 7;
    if (y + spaceNeeded > pageH - MARGIN_B) {
      doc.addPage();
      drawHeader();
      y = 38;
    }

    // Section heading bar
    doc.setFillColor(...C.sectionBg);
    doc.rect(MARGIN_L, y - 4.5, COL_W, 8, "F");

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.ink);
    doc.text(title.toUpperCase(), MARGIN_L + 2, y);

    const sub = `${count} ${count === 1 ? "entry" : "entries"}   ·   Total: Rs. ${fmtPK(total)}`;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.muted);
    doc.text(sub, PAGE_W - MARGIN_R - 2, y, { align: "right" });

    y += 5;

    if (body.length === 0) {
      doc.setFontSize(8.5);
      doc.setTextColor(...C.muted);
      doc.text("No entries in this period.", MARGIN_L + 2, y + 5);
      y += 14;
      return;
    }

    const baseStyles: AnyStyle = {
      fontSize: 8,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      textColor: C.body,
      lineColor: C.rule,
      lineWidth: lw(0, 0, 0.15, 0),
      font: "helvetica",
      fontStyle: "normal",
    };
    const hStyles: AnyStyle = {
      fillColor: C.white,
      textColor: C.muted,
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      lineColor: C.headerRule,
      lineWidth: lw(0, 0, 0.5, 0),
    };

    const colStyles = widths.reduce<Record<number, AnyStyle>>((acc, w, i) => {
      acc[i] = {
        cellWidth: w,
        ...(numericCols.includes(i) ? { halign: "right" } : {}),
      };
      return acc;
    }, {});

    // Total row — use pre-passed `total` for the primary amount col, blank elsewhere.
    const totalRow = head.map((_, i) => {
      if (i === 0) return "Total";
      if (i === numericCols[0]) return fmtPK(total);
      return "";
    });

    autoTable(doc, {
      startY: y,
      head: [head.map((h) => h.toUpperCase())],
      body: [...body, totalRow],
      styles: baseStyles as never,
      headStyles: hStyles as never,
      alternateRowStyles: { fillColor: C.white } as never,
      columnStyles: colStyles as never,
      didParseCell: (d: { row: { index: number }; cell: { styles: unknown } }) => {
        if (d.row.index === body.length) {
          const s = d.cell.styles as AnyStyle;
          s.fontStyle = "bold";
          s.fillColor = C.totalFill;
          s.lineWidth = lw(0.5, 0, 0, 0);
          s.lineColor = [70, 70, 85] as RGB;
        }
      },
      didDrawPage: (d: { pageNumber: number }) => {
        if (d.pageNumber > 1) drawHeader();
      },
      margin: { left: MARGIN_L, right: MARGIN_R, top: 35, bottom: MARGIN_B },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // ── Render each section ───────────────────────────────────────────────────────
  if (data.collections !== null) {
    const w = colWidths.collections;
    renderSection(
      "Collections",
      data.totals.collected,
      data.collections.length,
      ["Date", "Flat", "Resident", "Category", "Amount", "Mode", "Receipt#"],
      data.collections.map((r) => [r.date, r.flat, r.resident, r.category, fmtPK(r.amount), r.mode, r.receipt]),
      [w.date, w.flat, w.resident, w.category, w.amount, w.mode, w.receipt],
      [4],
    );
  }

  if (data.expenses !== null) {
    const w = colWidths.expenses;
    renderSection(
      "Operating Expenses",
      data.totals.expenses,
      data.expenses.length,
      ["Date", "Category", "Description", "Vendor", "Amount"],
      data.expenses.map((r) => [r.date, r.category, r.description, r.vendor, fmtPK(r.amount)]),
      [w.date, w.category, w.description, w.vendor, w.amount],
      [4],
    );
  }

  if (data.bills !== null) {
    const w = colWidths.bills;
    renderSection(
      "Utility Bills",
      data.totals.bills,
      data.bills.length,
      ["Date", "Bill Type", "Vendor", "Amount", "Units"],
      data.bills.map((r) => [r.date, r.billType, r.vendor, fmtPK(r.amount), r.units]),
      [w.date, w.billType, w.vendor, w.amount, w.units],
      [3],
    );
  }

  if (data.salaries !== null) {
    const w = colWidths.salaries;
    renderSection(
      "Staff Salaries",
      data.totals.salaries,
      data.salaries.length,
      ["Date", "Staff Name", "Position", "Amount"],
      data.salaries.map((r) => [r.date, r.staffName, r.staffRole, fmtPK(r.amount)]),
      [w.date, w.staffName, w.position, w.amount],
      [3],
    );
  }

  if (data.projects !== null) {
    const total = data.projects.reduce((s, r) => s + r.amount, 0);
    const w = colWidths.projects;
    renderSection(
      "Projects",
      total,
      data.projects.length,
      ["Date", "Project", "Amount", "Mode"],
      data.projects.map((r) => [r.date, r.projectName, fmtPK(r.amount), r.mode]),
      [w.date, w.projectName, w.amount, w.mode],
      [2],
    );
  }

  const safeBuilding = data.buildingName.replace(/\s+/g, "_");
  doc.save(`monthly_report_${safeBuilding}_${data.from}_to_${data.to}.pdf`);
}
