import type { createClient } from "@/lib/supabase/server";

type DbClient = Awaited<ReturnType<typeof createClient>>;

/** Invoice states that still owe money. Mirrors the allocation RPC. */
const OPEN_STATUSES = ["pending", "partial", "overdue"] as const;

/**
 * The last month a flat is covered up to, as a `billing_month` date string,
 * or null when it is not covered at all.
 *
 * "Covered up to" means every month on or before it is settled — paid or
 * waived. It deliberately stops at the first gap: a flat that paid January
 * and March but not February is covered through January, not March. Telling
 * someone they are paid up to March while chasing them for February is how
 * you lose an argument at a committee meeting.
 *
 * This is the question a resident actually asks after paying six months up
 * front, and the one `outstanding_dues` cannot answer — a zero balance means
 * "nothing overdue", not "covered until July".
 */
export async function paidThroughMonth(
  supabase: DbClient,
  buildingId: string,
  flatId: string,
): Promise<string | null> {
  // The first gap. Everything from here on is uncovered by definition.
  const { data: openRows } = await supabase
    .from("bms_invoices")
    .select("billing_month")
    .eq("building_id", buildingId)
    .eq("flat_id", flatId)
    .in("status", OPEN_STATUSES as unknown as string[])
    .order("billing_month", { ascending: true })
    .limit(1);

  const firstGap = openRows?.[0]?.billing_month ?? null;

  let q = supabase
    .from("bms_invoices")
    .select("billing_month")
    .eq("building_id", buildingId)
    .eq("flat_id", flatId)
    .in("status", ["paid", "waived"])
    .order("billing_month", { ascending: false })
    .limit(1);

  if (firstGap) q = q.lt("billing_month", firstGap);

  const { data: settledRows } = await q;
  return settledRows?.[0]?.billing_month ?? null;
}

/**
 * Same rule as {@link paidThroughMonth}, computed from invoices already in
 * memory. Used where the caller has loaded them anyway.
 *
 * A resident occupying more than one flat gets the EARLIEST of their flats'
 * covered-to months. Claiming they are covered until July because one of two
 * flats is, while the other is three months behind, would be a lie of exactly
 * the kind this figure exists to prevent.
 */
export function paidThroughFrom(
  invoices: { flat_id: string; billing_month: string; status: string | null }[],
): string | null {
  if (invoices.length === 0) return null;

  const byFlat = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const list = byFlat.get(inv.flat_id) ?? [];
    list.push(inv);
    byFlat.set(inv.flat_id, list);
  }

  let earliest: string | null = null;
  for (const list of byFlat.values()) {
    const sorted = [...list].sort((a, b) =>
      a.billing_month.localeCompare(b.billing_month),
    );
    let covered: string | null = null;
    for (const inv of sorted) {
      const settled = inv.status === "paid" || inv.status === "waived";
      if (!settled) break; // first gap ends the run
      covered = inv.billing_month;
    }
    // A flat with nothing covered drags the whole answer to null.
    if (covered === null) return null;
    if (earliest === null || covered < earliest) earliest = covered;
  }
  return earliest;
}

/**
 * Advance a flat is holding that no invoice has claimed yet — what the
 * resident has paid beyond every month billed so far.
 */
export async function advanceHeld(
  supabase: DbClient,
  buildingId: string,
  flatId: string,
): Promise<number> {
  const { data } = await supabase
    .from("bms_flat_credits")
    .select("amount")
    .eq("building_id", buildingId)
    .eq("flat_id", flatId)
    .is("applied_invoice_id", null);

  return (data ?? []).reduce(
    (s, c) => s + Number((c as { amount: number }).amount ?? 0),
    0,
  );
}
