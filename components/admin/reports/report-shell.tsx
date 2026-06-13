"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColumnPickerButton } from "./column-picker";
import { DateRangePicker } from "./date-range-picker";
import { ReportTable } from "./report-table";
import { downloadReportCsv } from "@/lib/reports/csv-export";
import { downloadReportPdf } from "@/lib/reports/pdf-export";
import { formatDate } from "@/lib/utils";
import type { DateRange, ReportColumn } from "@/lib/reports/types";

/**
 * Generic shell every report page uses. Caller supplies:
 *   - The full column set (visibility/order managed inside)
 *   - The (filtered) rows
 *   - DateRange + setDateRange (so caller controls server-side fetch keys)
 *   - Optional extra filter widgets (rendered next to the date picker)
 *   - Optional filtersLine for PDF (e.g. "Bank: HBL Main · Category: utilities")
 *
 * Shell handles the data-dependent chrome ONLY: report subtitle, filter bar,
 * column picker, CSV + PDF buttons, preview table, totals.
 *
 * The PAGE-LEVEL chrome (the "Reports" heading + tab strip) is rendered by
 * each page's OUTER sync server component, OUTSIDE the Suspense boundary,
 * so tab switches paint instantly even while this shell is still suspending
 * on data fetch.
 */
export function ReportShell<Row>({
  title,
  subtitle,
  buildingName,
  reportName,
  filename,
  dateRange,
  setDateRange,
  extraFilters,
  filtersLine,
  columns,
  visibleColumns,
  enabledIds,
  setColumn,
  rows,
  emptyText,
  showTotals = true,
  pinnedTopRow,
  pinnedBottomRow,
}: {
  title: string;
  subtitle?: string;
  buildingName: string;
  /** Stable key for localStorage persistence + PDF filename suffix. */
  reportName: string;
  /** Base filename (without extension or date). */
  filename: string;
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
  extraFilters?: React.ReactNode;
  filtersLine?: string;
  columns: ReportColumn<Row>[];
  visibleColumns: ReportColumn<Row>[];
  enabledIds: Set<string>;
  setColumn: (id: string, on: boolean) => void;
  rows: Row[];
  emptyText?: string;
  showTotals?: boolean;
  /** Pre-computed cells prepended as the first table row (e.g. Opening Balance). */
  pinnedTopRow?: (string | number)[];
  /** Pre-computed cells appended as the last table row, after totals (e.g. Closing Balance). */
  pinnedBottomRow?: (string | number)[];
}) {
  const [exporting, setExporting] = useState(false);

  const period = `${formatDate(dateRange.from)} – ${formatDate(dateRange.to)}`;
  const fileStamp = `${dateRange.from}_to_${dateRange.to}`;
  const baseName = `${filename}_${fileStamp}`;

  const onCsv = () => {
    downloadReportCsv({
      filename: baseName,
      columns: visibleColumns,
      rows,
      totalsRow: showTotals,
      pinnedTopRow,
      pinnedBottomRow,
    });
  };

  const onPdf = async () => {
    setExporting(true);
    try {
      await downloadReportPdf({
        meta: {
          title,
          buildingName,
          period,
          filtersLine,
          filename: baseName,
        },
        columns: visibleColumns,
        rows,
        totalsRow: showTotals,
        pinnedTopRow,
        pinnedBottomRow,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Report subtitle */}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        )}
      </div>

      {/* Filter bar */}
      <div className="card-soft space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          {extraFilters}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
          <ColumnPickerButton
            columns={columns}
            enabledIds={enabledIds}
            setColumn={setColumn}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCsv}
              disabled={rows.length === 0 || visibleColumns.length === 0}
              className="gap-1.5"
            >
              <Download className="w-4 h-4" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onPdf}
              disabled={
                exporting || rows.length === 0 || visibleColumns.length === 0
              }
              className="gap-1.5"
            >
              <FileText className="w-4 h-4" />
              {exporting ? "Generating…" : "PDF"}
            </Button>
          </div>
        </div>
      </div>

      {/* Live preview = single source of truth */}
      <ReportTable
        columns={visibleColumns}
        rows={rows}
        emptyText={emptyText}
        showTotals={showTotals}
        pinnedTopRow={pinnedTopRow}
        pinnedBottomRow={pinnedBottomRow}
      />
    </div>
  );
}
