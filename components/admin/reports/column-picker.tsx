"use client";

import { useEffect, useState } from "react";
import { Columns3 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { ReportColumn } from "@/lib/reports/types";

/**
 * Column visibility picker.
 *
 * Holds a Set<columnId> of enabled columns and persists it in localStorage
 * under `bms-report-columns-${reportName}` so admin's choices stick across
 * sessions. The preview table + CSV + PDF all read from the same enabled
 * Set — single source of truth.
 */
export function useColumnPicker<Row>(
  reportName: string,
  columns: ReportColumn<Row>[],
): {
  enabledIds: Set<string>;
  visibleColumns: ReportColumn<Row>[];
  setColumn: (id: string, on: boolean) => void;
} {
  const storageKey = `bms-report-columns-${reportName}`;
  const [enabledIds, setEnabledIds] = useState<Set<string>>(() => {
    // Default = columns flagged defaultOn. Loaded synchronously so the
    // first render already reflects persisted prefs (no flicker).
    return new Set(columns.filter((c) => c.defaultOn).map((c) => c.id));
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const ids: string[] = JSON.parse(raw);
      if (!Array.isArray(ids)) return;
      // Only keep ids that still exist in the report's column set — old
      // entries from a previous version of the report shouldn't survive.
      const known = new Set(columns.map((c) => c.id));
      const filtered = ids.filter((id) => known.has(id));
      if (filtered.length > 0) setEnabledIds(new Set(filtered));
    } catch {
      // localStorage may throw in private-mode Safari etc. — fall back to defaults.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persist = (next: Set<string>) => {
    setEnabledIds(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  const setColumn = (id: string, on: boolean) => {
    const next = new Set(enabledIds);
    if (on) next.add(id);
    else next.delete(id);
    persist(next);
  };

  // Preserve declared column order — Sets are insertion-ordered but the
  // user toggles them out-of-order. Filtering the original list keeps
  // headers stable across toggles.
  const visibleColumns = columns.filter((c) => enabledIds.has(c.id));

  return { enabledIds, visibleColumns, setColumn };
}

export function ColumnPickerButton<Row>({
  columns,
  enabledIds,
  setColumn,
}: {
  columns: ReportColumn<Row>[];
  enabledIds: Set<string>;
  setColumn: (id: string, on: boolean) => void;
}) {
  const shownCount = enabledIds.size;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Columns3 className="w-4 h-4" />
          Columns
          <span className="text-xs text-muted-foreground">
            ({shownCount} of {columns.length})
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <div className="space-y-1">
          {columns.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/60 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={enabledIds.has(c.id)}
                onChange={(e) => setColumn(c.id, e.target.checked)}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
