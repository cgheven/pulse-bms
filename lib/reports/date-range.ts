// Pulse BMS — Reports date range helpers
//
// All dates are in ISO YYYY-MM-DD local form (no timezone) so they line
// up with the date columns in bms_expenses.expense_date,
// bms_payments.payment_date etc., which are stored as `date` not
// `timestamptz`. We deliberately AVOID `toISOString()` on a Date here
// because that converts to UTC midnight and can roll a Karachi-zone day
// back by 5 hours.

import type { DateRange, DateRangePreset } from "./types";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function presetRange(preset: DateRangePreset): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const iso = (d: Date) => toIsoDate(d);

  switch (preset) {
    case "today":
      return { preset, from: iso(today), to: iso(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { preset, from: iso(y), to: iso(y) };
    }
    case "last_7": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6); // inclusive 7 days incl today
      return { preset, from: iso(start), to: iso(today) };
    }
    case "last_30": {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { preset, from: iso(start), to: iso(today) };
    }
    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { preset, from: iso(start), to: iso(end) };
    }
    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { preset, from: iso(start), to: iso(end) };
    }
    case "this_year": {
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear(), 11, 31);
      return { preset, from: iso(start), to: iso(end) };
    }
    case "custom":
    default:
      return { preset: "custom", from: iso(today), to: iso(today) };
  }
}

export function rangeLabel(preset: DateRangePreset): string {
  switch (preset) {
    case "today":      return "Today";
    case "yesterday":  return "Yesterday";
    case "last_7":     return "Last 7 days";
    case "last_30":    return "Last 30 days";
    case "this_month": return "This month";
    case "last_month": return "Last month";
    case "this_year":  return "This year";
    case "custom":     return "Custom range";
  }
}

export const ALL_PRESETS: DateRangePreset[] = [
  "today",
  "yesterday",
  "last_7",
  "last_30",
  "this_month",
  "last_month",
  "this_year",
  "custom",
];

/**
 * Walks each day in [from, to] inclusive and yields YYYY-MM-DD strings.
 * Used by Cash Position to build the daily breakdown table.
 */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  const cur = new Date(start);
  while (cur <= end) {
    out.push(toIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * Yields { from, to } for each calendar month in the range. The first /
 * last segments are clipped to the requested range so partial months
 * still show real opening/closing balances.
 */
export function eachMonth(
  from: string,
  to: string,
): Array<{ from: string; to: string; label: string }> {
  const out: Array<{ from: string; to: string; label: string }> = [];
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const monthStart = new Date(cur);
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const clippedFrom = monthStart < start ? start : monthStart;
    const clippedTo = monthEnd > end ? end : monthEnd;
    out.push({
      from: toIsoDate(clippedFrom),
      to: toIsoDate(clippedTo),
      label: monthStart.toLocaleDateString("en-PK", {
        month: "short",
        year: "numeric",
      }),
    });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return out;
}

/** Inclusive day count between two YYYY-MM-DD strings. */
export function dayCount(from: string, to: string): number {
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86400000) + 1;
}

// Strict ISO date guard for ?from= / ?to= search params. Anything not
// matching YYYY-MM-DD is treated as missing — keeps SQL date-cast safe.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  return !Number.isNaN(d.getTime()) && toIsoDate(d) === s;
}

/**
 * Resolve a DateRange from URL search params (?from=YYYY-MM-DD&to=YYYY-MM-DD).
 * Falls back to the "this_month" preset if either bound is missing or invalid.
 * Used by /admin/reports/* server pages to drive server-side date filtering.
 */
export function rangeFromSearchParams(params: {
  from?: string;
  to?: string;
}): DateRange {
  const from = params.from && isValidIsoDate(params.from) ? params.from : null;
  const to = params.to && isValidIsoDate(params.to) ? params.to : null;
  if (from && to && from <= to) {
    return { preset: "custom", from, to };
  }
  return presetRange("this_month");
}
