"use server";

import { requireRole } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { createClient } from "@/lib/supabase/server";

/**
 * Quick Setup status — powers the guided checklist at /admin/setup, the
 * highlighted sidebar link, and the dashboard "finish setup" banner.
 *
 * Every step is derived from REAL data (a flat exists, a payment is recorded,
 * …) so the checklist ticks itself as the admin works through the app — there
 * is no separate "mark done" flag to drift out of sync. Each step links to the
 * page where that data is created; nothing is filled in on the setup page
 * itself, which keeps this read-only and cheap.
 *
 * Counts use `head: true` + `count: "exact"` (a header, not a PostgREST
 * aggregate — aggregates are disabled on this project; see CLAUDE.md).
 */

export type SetupStepKey =
  | "details"
  | "flats"
  | "residents"
  | "invoices"
  | "payment"
  | "opening"
  | "bank"
  | "staff"
  | "notice";

export type SetupStep = { key: SetupStepKey; done: boolean; required: boolean };

export type SetupStatus = {
  steps: SetupStep[];
  /** Steps completed (required + optional). */
  done: number;
  total: number;
  /** Required steps only — drives the dashboard banner + "setup complete". */
  requiredDone: number;
  requiredTotal: number;
  /** True once every REQUIRED step is done. */
  setupComplete: boolean;
};

export async function getSetupStatus(): Promise<SetupStatus> {
  await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  const supabase = await createClient();

  // Ordered: required steps first (the natural setup flow), optional after.
  const defs: { key: SetupStepKey; required: boolean }[] = [
    { key: "details", required: true },
    { key: "flats", required: true },
    { key: "residents", required: true },
    { key: "invoices", required: true },
    { key: "payment", required: true },
    { key: "opening", required: false },
    { key: "bank", required: false },
    { key: "staff", required: false },
    { key: "notice", required: false },
  ];

  if (!buildingId) {
    const steps = defs.map((d) => ({ ...d, done: false }));
    return {
      steps,
      done: 0,
      total: steps.length,
      requiredDone: 0,
      requiredTotal: steps.filter((s) => s.required).length,
      setupComplete: false,
    };
  }

  const countOf = (table: string) =>
    supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("building_id", buildingId);

  const [building, flats, residents, invoices, payments, banks, staff, notices] =
    await Promise.all([
      supabase
        .from("bms_buildings")
        .select("city, address, opening_balance_date")
        .eq("id", buildingId)
        .maybeSingle(),
      countOf("bms_flats"),
      countOf("bms_residents"),
      countOf("bms_invoices"),
      countOf("bms_payments"),
      countOf("bms_bank_accounts"),
      countOf("bms_staff"),
      countOf("bms_notices"),
    ]);

  const b = building.data as
    | { city: string | null; address: string | null; opening_balance_date: string | null }
    | null;

  const doneMap: Record<SetupStepKey, boolean> = {
    details: !!(b?.city?.trim() || b?.address?.trim()),
    flats: (flats.count ?? 0) > 0,
    residents: (residents.count ?? 0) > 0,
    invoices: (invoices.count ?? 0) > 0,
    payment: (payments.count ?? 0) > 0,
    opening: !!b?.opening_balance_date,
    bank: (banks.count ?? 0) > 0,
    staff: (staff.count ?? 0) > 0,
    notice: (notices.count ?? 0) > 0,
  };

  const steps: SetupStep[] = defs.map((d) => ({ ...d, done: doneMap[d.key] }));
  const done = steps.filter((s) => s.done).length;
  const requiredSteps = steps.filter((s) => s.required);
  const requiredDone = requiredSteps.filter((s) => s.done).length;

  return {
    steps,
    done,
    total: steps.length,
    requiredDone,
    requiredTotal: requiredSteps.length,
    setupComplete: requiredDone === requiredSteps.length,
  };
}
