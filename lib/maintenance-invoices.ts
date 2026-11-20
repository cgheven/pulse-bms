import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Maintenance-invoice generation — the single source of truth, used by:
 *   - the monthly cron (/api/cron/generate-invoices), for every building,
 *   - lazy generation when an admin first opens the current month,
 *   - the (now internal) generateMonthlyInvoices server action.
 *
 * Idempotent: `bms_invoices` has UNIQUE (building_id, flat_id, billing_month),
 * and this skips any flat already billed for the month. Vacant flats are never
 * billed. Each new invoice is immediately settled against any advance the flat
 * is holding via `bms_apply_flat_credits` (one transaction per invoice), which
 * also rebuilds outstanding_dues — the same path the manual button used.
 *
 * Works with either Supabase client: the session client (RLS applies — an
 * admin acting on their own building) or the service-role admin client (cron).
 */

function firstOfMonth(yyyyMm: string): string {
  return `${yyyyMm}-01`;
}

function buildInvoiceNumber(buildingPrefix: string, flatNumber: string, ym: string): string {
  const monthKey = ym.replace("-", "");
  return `INV-${buildingPrefix}-${flatNumber}-${monthKey}`.toUpperCase();
}

export type GenerateInvoicesResult = {
  inserted: number;
  alreadyBilled: number;
  vacantCount: number;
  creditsApplied: number;
  creditsAmount: number;
};

export async function generateMaintenanceInvoices(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  buildingId: string,
  month: string, // "YYYY-MM"
): Promise<GenerateInvoicesResult> {
  const billing_month = firstOfMonth(month);

  const { data: building } = await supabase
    .from("bms_buildings")
    .select("name, monthly_fee_default, invoice_due_day")
    .eq("id", buildingId)
    .single();

  const dueDay = Math.min(28, Math.max(1, Number(building?.invoice_due_day ?? 10)));
  const due_date = `${month}-${String(dueDay).padStart(2, "0")}`;
  const buildingPrefix =
    (building?.name ?? "B").slice(0, 3).replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BLD";
  const defaultFee = Number(building?.monthly_fee_default ?? 3000);

  const { data: flats, error: flatsErr } = await supabase
    .from("bms_flats")
    .select("id, flat_number, monthly_fee, ownership_type")
    .eq("building_id", buildingId);
  if (flatsErr) throw new Error(flatsErr.message);

  const { data: existing } = await supabase
    .from("bms_invoices")
    .select("flat_id")
    .eq("building_id", buildingId)
    .eq("billing_month", billing_month);
  const existingSet = new Set((existing ?? []).map((r) => r.flat_id as string));

  const toInsert: Array<{
    building_id: string;
    flat_id: string;
    invoice_number: string;
    billing_month: string;
    amount: number;
    status: string;
    due_date: string;
  }> = [];

  for (const f of flats ?? []) {
    if (f.ownership_type === "vacant") continue;
    if (existingSet.has(f.id)) continue;
    toInsert.push({
      building_id: buildingId,
      flat_id: f.id,
      invoice_number: buildInvoiceNumber(buildingPrefix, f.flat_number, month),
      billing_month,
      amount: Number(f.monthly_fee ?? defaultFee),
      status: "pending",
      due_date,
    });
  }

  const vacantCount = (flats ?? []).filter((f) => f.ownership_type === "vacant").length;
  const alreadyBilled = existingSet.size;

  let inserted = 0;
  let creditsApplied = 0;
  let creditsAmount = 0;

  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from("bms_invoices")
      .insert(toInsert)
      .select("id, flat_id, amount, billing_month, invoice_number");
    if (error) throw new Error(error.message);
    inserted = data?.length ?? 0;

    for (const row of data ?? []) {
      const { data: applied, error: applyErr } = await supabase.rpc("bms_apply_flat_credits", {
        p_building_id: buildingId,
        p_flat_id: row.flat_id,
        p_invoice_id: row.id,
      });
      if (applyErr) throw new Error(applyErr.message);
      const res = applied as { applied: number; count: number } | null;
      creditsAmount += Number(res?.applied ?? 0);
      creditsApplied += Number(res?.count ?? 0);
    }
  }

  return { inserted, alreadyBilled, vacantCount, creditsApplied, creditsAmount };
}
