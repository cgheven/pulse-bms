"use client";

import { FileSpreadsheet } from "lucide-react";
import type { ReportColumn } from "@/lib/reports/types";
import { formatCurrency } from "@/lib/utils";

/**
 * Live preview table — mirrors what the CSV / PDF will contain.
 *
 * Numeric columns get right-aligned + tabular-nums + currency formatting
 * in the preview only (CSV / PDF receive raw numbers so accountants can
 * sum / filter). Empty state shows a friendly icon + message; totals row
 * shows the sum of every numeric column at the bottom.
 */
export function ReportTable<Row>({
  columns,
  rows,
  emptyText = "No rows match these filters.",
  showTotals = true,
  pinnedTopRow,
  pinnedBottomRow,
}: {
  columns: ReportColumn<Row>[];
  rows: Row[];
  emptyText?: string;
  showTotals?: boolean;
  /** Pre-computed cells rendered as the first body row (e.g. Opening Balance). */
  pinnedTopRow?: (string | number)[];
  /** Pre-computed cells rendered as the last body row, after totals (e.g. Closing Balance). */
  pinnedBottomRow?: (string | number)[];
}) {
  if (columns.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white text-gray-600 p-10 text-center shadow-sm">
        Toggle at least one column on to see data.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 flex flex-col items-center gap-2 text-gray-500 shadow-sm">
        <FileSpreadsheet className="w-10 h-10 opacity-40" />
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }

  // Pre-compute totals once. Non-numeric columns get a blank string so
  // the totals row stays visually aligned; first non-numeric column shows
  // the "Total" label.
  const totals = columns.map((c, idx) => {
    if (!c.numeric) return idx === 0 ? "Total" : "";
    const sum = rows.reduce((acc, r) => {
      const v = c.accessor(r);
      const n = typeof v === "number" ? v : Number(v) || 0;
      return acc + n;
    }, 0);
    return sum;
  });

  // Printed-document look: white paper inside the dark UI. Signals "this
  // is the actual artefact — what CSV/PDF will show — not just a UI table."
  return (
    <div className="rounded-xl border border-gray-200 bg-white text-gray-900 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr className="text-left">
              {columns.map((c) => (
                <th
                  key={c.id}
                  className={`px-3 py-3 font-semibold text-xs uppercase tracking-wider text-gray-700 ${
                    c.numeric ? "text-right" : ""
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Opening Balance — pinned before data rows */}
            {pinnedTopRow && (
              <tr className="bg-blue-50/60 border-b border-blue-100 font-semibold">
                {pinnedTopRow.map((cell, i) => (
                  <td
                    key={i}
                    className={`px-3 py-2.5 text-gray-800 ${
                      columns[i]?.numeric ? "text-right tabular-nums" : ""
                    }`}
                  >
                    {columns[i]?.numeric && typeof cell === "number"
                      ? formatCurrency(cell)
                      : cell}
                  </td>
                ))}
              </tr>
            )}

            {rows.map((row, idx) => (
              <tr
                key={idx}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
              >
                {columns.map((c) => {
                  const v = c.accessor(row);
                  return (
                    <td
                      key={c.id}
                      className={`px-3 py-2.5 whitespace-nowrap text-gray-900 ${
                        c.numeric ? "text-right tabular-nums font-medium" : ""
                      }`}
                    >
                      {c.numeric
                        ? typeof v === "number"
                          ? formatCurrency(v)
                          : v
                        : v}
                    </td>
                  );
                })}
              </tr>
            ))}

            {showTotals && (
              <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                {totals.map((t, idx) => {
                  const c = columns[idx];
                  return (
                    <td
                      key={c.id}
                      className={`px-3 py-3 text-gray-900 ${
                        c.numeric ? "text-right tabular-nums" : ""
                      }`}
                    >
                      {c.numeric && typeof t === "number"
                        ? formatCurrency(t)
                        : t}
                    </td>
                  );
                })}
              </tr>
            )}

            {/* Closing Balance — pinned after totals */}
            {pinnedBottomRow && (
              <tr className="bg-indigo-50/60 border-t-2 border-indigo-200 font-bold">
                {pinnedBottomRow.map((cell, i) => (
                  <td
                    key={i}
                    className={`px-3 py-3 text-gray-900 ${
                      columns[i]?.numeric ? "text-right tabular-nums" : ""
                    }`}
                  >
                    {columns[i]?.numeric && typeof cell === "number"
                      ? formatCurrency(cell)
                      : cell}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
