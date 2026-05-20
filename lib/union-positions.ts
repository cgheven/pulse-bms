// Pulse BMS — union position label helper
//
// Single source of truth for converting the raw `bms_union_members.position`
// text (stored as lowercase slugs like "president", "vp", "treasurer") into
// the human-friendly label shown on receipts, collection summaries, and the
// recorded snapshot stored on `bms_payments.received_by_position`.
//
// History note: existing demo data uses both "vp" (the dropdown value) and
// "vice_president" (an earlier seed). Map both to "Vice President" so the
// receiver string is always neat.

export const UNION_POSITION_LABEL: Record<string, string> = {
  president:       "President",
  vp:              "Vice President",
  vice_president:  "Vice President",
  secretary:       "Secretary",
  treasurer:       "Treasurer",
  member:          "Member",
};

// Priority order used to pick the "best" position when a single profile
// holds MULTIPLE active rows in bms_union_members (e.g. demo data where
// one person is both VP and Treasurer). Highest-authority position wins
// so the receiver snapshot on bms_payments is stable and deterministic.
// Earlier index = higher priority.
export const UNION_POSITION_PRIORITY: readonly string[] = [
  "president",
  "vice_president",
  "vp",
  "secretary",
  "general_secretary",
  "treasurer",
  "member",
];

/**
 * Human-friendly label for a stored position slug. Unknown slugs fall back
 * to a Title-Cased version of the slug itself so we never render an empty
 * pill. Returns null when the input is null/empty so callers can decide
 * whether to render the parenthetical at all.
 */
export function unionPositionLabel(position: string | null | undefined): string | null {
  if (!position) return null;
  const known = UNION_POSITION_LABEL[position];
  if (known) return known;
  // Fallback: turn "head_of_block" into "Head Of Block".
  return position
    .split(/[\s_]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
