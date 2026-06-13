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
  /** Optional row of pre-computed cells prepended before the data rows (e.g. Opening Balance). */
  pinnedTopRow?: (string | number)[];
  /** Optional row of pre-computed cells appended after the totals row (e.g. Closing Balance). */
  pinnedBottomRow?: (string | number)[];
}): void {
  const { filename, columns, rows, totalsRow = true, pinnedTopRow, pinnedBottomRow } = opts;

  const header = columns.map((c) => escapeCell(c.label)).join(",");

  const pinnedTopLine = pinnedTopRow
    ? pinnedTopRow.map(escapeCell).join(",") + "\n"
    : "";

  const body = rows
    .map((row) => columns.map((c) => escapeCell(c.accessor(row))).join(","))
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

  const pinnedBottomLine = pinnedBottomRow
    ? "\n" + pinnedBottomRow.map(escapeCell).join(",")
    : "";

  const csv =
    "﻿" + header + "\n" + pinnedTopLine + body + totals + pinnedBottomLine;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
