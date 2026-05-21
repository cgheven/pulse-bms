// Pulse BMS — Day Book CSV exporter.
//
// While the on-screen Day Book + PDF are narrative per-day blocks,
// Excel users want one-row-per-transaction so they can pivot, filter
// and sum. So the CSV is flat tabular with a "Type" column tagging
// each row: Opening / Income / Expense / Closing.
//
// Format mirrors the GMS compliance pattern from csv-export.ts:
// UTF-8 with BOM (Excel + PKR / Urdu vendor names), RFC 4180 quoting,
// blob → object URL → anchor click.

import type { DayBookDay } from "@/app/(admin)/admin/reports/day-book/day-book-client";

function escapeCell(value: string | number): string {
  const s = typeof value === "number" ? String(value) : value ?? "";
  return `"${s.replace(/"/g, '""')}"`;
}

const HEADERS = [
  "Date",
  "Type",
  "Category",
  "Description",
  "Source",
  "Mode",
  "Bank Account",
  "Amount",
  "Running Balance",
  "Notes",
];

export function downloadDayBookCsv(opts: {
  filename: string;
  days: DayBookDay[];
}): void {
  const { filename, days } = opts;

  const lines: string[] = [];
  lines.push(HEADERS.map(escapeCell).join(","));

  for (const day of days) {
    // Opening row — balance carried into this day.
    lines.push(
      [
        day.date,
        "Opening",
        "",
        "Opening balance",
        "",
        "",
        "",
        day.opening,
        day.opening,
        "",
      ]
        .map(escapeCell)
        .join(","),
    );

    if (day.isEmpty) {
      // Skip income/expense rows. Closing for clarity still emitted.
    } else {
      // Income lines. Credit carry-forward rows: Amount=0 + note,
      // since no cash actually moved. The "real" amount stays visible
      // via the Notes column for traceability.
      for (const line of day.income) {
        const amount = line.isCredit ? 0 : line.amount;
        const notes = line.isCredit
          ? `Credit applied (virtual amount Rs. ${line.amount})`
          : "";
        lines.push(
          [
            day.date,
            "Income",
            line.categoryLabel,
            line.description,
            line.description,
            line.modeLabel,
            line.bankName,
            amount,
            "",
            notes,
          ]
            .map(escapeCell)
            .join(","),
        );
      }
      // Bank seed activation on this day reads as Income too.
      if (day.seedAmount > 0) {
        lines.push(
          [
            day.date,
            "Income",
            "Opening Cash",
            "Bank seed",
            "",
            "",
            "",
            day.seedAmount,
            "",
            "Bank account opening balance activation",
          ]
            .map(escapeCell)
            .join(","),
        );
      }
      // Building-level opening seed (society's onboarding cash on hand).
      if (day.buildingSeedAmount > 0) {
        lines.push(
          [
            day.date,
            "Income",
            "Opening Balance",
            "Society onboarding seed",
            "",
            "",
            "",
            day.buildingSeedAmount,
            "",
            "Opening balance (onboarding)",
          ]
            .map(escapeCell)
            .join(","),
        );
      }
      // Expense lines (incl. salary payments).
      for (const line of day.expenses) {
        lines.push(
          [
            day.date,
            "Expense",
            line.categoryLabel,
            line.description,
            line.source,
            "",
            line.bankName,
            line.amount,
            "",
            "",
          ]
            .map(escapeCell)
            .join(","),
        );
      }
    }

    // Closing row — balance after today's movements.
    lines.push(
      [
        day.date,
        "Closing",
        "",
        "Closing balance",
        "",
        "",
        "",
        day.closing,
        day.closing,
        "",
      ]
        .map(escapeCell)
        .join(","),
    );
  }

  // BOM keeps Excel happy with UTF-8 (e.g. PKR symbol, Urdu vendor names).
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
