import type { createClient } from "@/lib/supabase/server";

// Server-side helpers for monthly recurring levies. A recurring levy is stored
// as a 'template' row; each month an admin opens the Levies page we lazily
// generate that month's draft instance (status='draft', parent_levy_id=template),
// back-filling any months that were skipped (capped). The unique index
// (parent_levy_id, billing_month) makes generation idempotent and race-safe.

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type LevyTemplate = {
  id: string;
  building_id: string;
  name: string;
  description: string | null;
  total_cost: number;
  fund_contribution: number;
  due_date: string;
};

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Pakistan is a fixed UTC+5 (no DST). Deriving the calendar month from a raw
// server clock (usually UTC) would roll the month a few hours early at the
// boundary, so we shift to PK time before reading year/month.
const PK_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Current { year, month0 } in Pakistan local time. month0 is 0-based. */
export function currentMonthParts(): { year: number; month0: number } {
  const pk = new Date(Date.now() + PK_OFFSET_MS);
  return { year: pk.getUTCFullYear(), month0: pk.getUTCMonth() };
}

/** First day of the given month as an ISO yyyy-MM-dd string. */
export function firstOfMonthISO(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}-01`;
}

function monthIndex(year: number, month0: number): number {
  return year * 12 + month0;
}

function monthIndexFromISO(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return y * 12 + (m - 1);
}

/** Carry the template's due day-of-month into a target month, clamped to that
 *  month's last day (e.g. day 31 → 28/30 in shorter months). */
export function dueDateForMonth(
  anchorDueDate: string,
  year: number,
  month0: number,
): string {
  const day = Number(anchorDueDate.slice(8, 10)) || 1;
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const d = Math.min(day, lastDay);
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Build the insert row for a single monthly instance of a template. */
export function buildInstanceRow(
  t: LevyTemplate,
  year: number,
  month0: number,
  dueDateOverride?: string,
) {
  return {
    building_id: t.building_id,
    parent_levy_id: t.id,
    billing_month: firstOfMonthISO(year, month0),
    name: `${t.name} — ${MONTHS_SHORT[month0]} ${year}`,
    description: t.description,
    total_cost: t.total_cost,
    fund_contribution: t.fund_contribution,
    is_recurring: false,
    recurrence_day: null,
    due_date: dueDateOverride ?? dueDateForMonth(t.due_date, year, month0),
    status: "draft" as const,
  };
}

// Never back-fill more than a year of missed months in one pass — a safety cap
// so a long-dormant building can't generate a flood of drafts on first visit.
const MAX_BACKFILL_MONTHS = 12;

/** Ensure every active recurring template has a draft for the current month
 *  (and any recently skipped months). Safe to call on every page render —
 *  idempotent via the unique index. */
export async function ensureRecurringDrafts(
  supabase: ServerClient,
  buildingId: string,
): Promise<void> {
  const { data: templates } = await supabase
    .from("bms_levies")
    .select("id, building_id, name, description, total_cost, fund_contribution, due_date")
    .eq("building_id", buildingId)
    .eq("status", "template")
    .eq("is_active", true);

  if (!templates || templates.length === 0) return;

  const { year, month0 } = currentMonthParts();
  const currentIdx = monthIndex(year, month0);

  // Pull every existing instance month for these templates in one query.
  const templateIds = templates.map((t) => t.id);
  const { data: existing } = await supabase
    .from("bms_levies")
    .select("parent_levy_id, billing_month")
    .in("parent_levy_id", templateIds);

  const have = new Set(
    (existing ?? []).map((r) => `${r.parent_levy_id}|${r.billing_month}`),
  );

  for (const t of templates as LevyTemplate[]) {
    // Start from when this levy began (its anchor due date), but never reach
    // further back than the back-fill cap.
    const startIdx = Math.max(
      monthIndexFromISO(t.due_date),
      currentIdx - (MAX_BACKFILL_MONTHS - 1),
    );

    for (let idx = startIdx; idx <= currentIdx; idx++) {
      const y = Math.floor(idx / 12);
      const m0 = idx % 12;
      const billing = firstOfMonthISO(y, m0);
      if (have.has(`${t.id}|${billing}`)) continue;

      const { error } = await supabase
        .from("bms_levies")
        .insert(buildInstanceRow(t, y, m0));
      // A concurrent request may insert first — the unique index rejects the
      // dup. Swallow that (and demo-mode RLS denials) so the page still renders.
      if (
        error &&
        !/duplicate key|unique|row-level security/i.test(error.message)
      ) {
        console.error("ensureRecurringDrafts insert failed:", error.message);
      }
    }
  }
}
