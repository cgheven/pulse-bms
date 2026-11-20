// Pulse BMS — Excel (.xlsx) exporter, shared across tables and reports.
//
// Same column-driven contract as csv-export / pdf-export (ReportColumn<Row>),
// so a table can offer CSV, Excel and PDF from one column definition. `xlsx`
// is lazy-imported so it never lands in the initial bundle — the download is
// a one-off user action.
//
// Pure client-side: builds a worksheet in memory and triggers a file save.

import type { ReportColumn } from "./types";

export async function downloadReportXlsx<Row>(opts: {
  filename: string;
  /** Worksheet (tab) name. Excel caps this at 31 chars. */
  sheetName?: string;
  columns: ReportColumn<Row>[];
  rows: Row[];
  /** Append a totals row for numeric columns. Off by default. */
  totalsRow?: boolean;
}): Promise<void> {
  const { filename, sheetName = "Sheet1", columns, rows, totalsRow = false } = opts;
  const XLSX = await import("xlsx");

  const data: (string | number)[][] = [columns.map((c) => c.label)];

  rows.forEach((r) => data.push(columns.map((c) => c.accessor(r))));

  if (totalsRow) {
    data.push(
      columns.map((c, idx) => {
        if (!c.numeric) return idx === 0 ? "Total" : "";
        return rows.reduce((acc, r) => {
          const v = c.accessor(r);
          return acc + (typeof v === "number" ? v : Number(v) || 0);
        }, 0);
      }),
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Width each column to the longest value in it (capped) so nothing is clipped.
  ws["!cols"] = columns.map((c, idx) => {
    const longest = data.reduce((max, row) => {
      const cell = row[idx];
      const len = cell == null ? 0 : String(cell).length;
      return Math.max(max, len);
    }, c.label.length);
    return { wch: Math.min(Math.max(longest + 2, 10), 48) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
