// Pulse BMS — Reports module shared types
//
// Every report defines a column set the user can toggle on/off. The
// preview table, CSV exporter and PDF exporter all read from the same
// list so they stay in sync — column picker = single source of truth.

export type ReportColumn<Row> = {
  /** Stable id used in localStorage keys + Set<columnId> state. */
  id: string;
  /** Header rendered in preview table + CSV + PDF. */
  label: string;
  /** Whether this column is on by default the very first time. */
  defaultOn: boolean;
  /** Returns the cell value (string OR number). */
  accessor: (row: Row) => string | number;
  /** Right-align for amount/currency columns in HTML + PDF. */
  numeric?: boolean;
  /** PDF column width hint in mm (optional). */
  widthMm?: number;
};

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";

export type DateRange = {
  preset: DateRangePreset;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
};
