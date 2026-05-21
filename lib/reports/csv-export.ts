// Pulse BMS — CSV exporter shared across all 5 reports.
//
// Matches GMS compliance pattern:
//   - UTF-8 with BOM prefix so Excel opens it correctly with PKR / Urdu
//     characters in vendor names, descriptions etc.
//   - Comma-separated, double-quote escape for any cell containing
//     a comma / quote / newline.
//   - First row = headers, last row = totals (only for amount columns).
//
// Pure client-side: blob → object URL → anchor click. No server roundtrip.

import type { ReportColumn } from "./types";

function escapeCell(value: string | number): string {
  const s = typeof value === "number" ? String(value) : value ?? "";
  // Always quote — keeps the CSV reader behaviour deterministic when a cell
  // has a comma, quote or newline. Doubles internal quotes per RFC 4180.
  return `"${s.replace(/"/g, '""')}"`;
}

export function downloadReportCsv<Row>(opts: {
  filename: string;
  columns: ReportColumn<Row>[];
  rows: Row[];
  /** Show a totals row at the bottom for numeric columns. */
  totalsRow?: boolean;
}): void {
  const { filename, columns, rows, totalsRow = true } = opts;

  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows
    .map((row) =>
      columns.map((c) => escapeCell(c.accessor(row))).join(","),
    )
    .join("\n");

  let totals = "";
  if (totalsRow) {
    const totalsCells = columns.map((c, idx) => {
      if (!c.numeric) return idx === 0 ? escapeCell("Total") : escapeCell("");
      const sum = rows.reduce((acc, r) => {
        const v = c.accessor(r);
        const n = typeof v === "number" ? v : Number(v) || 0;
        return acc + n;
      }, 0);
      return escapeCell(sum);
    });
    totals = "\n" + totalsCells.join(",");
  }

  // BOM + body. The empty line before totals visually separates the
  // totals row in spreadsheet apps that otherwise glue it onto the last
  // data row.
  const csv = "﻿" + header + "\n" + body + (totalsRow ? "\n" + totals : "");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
