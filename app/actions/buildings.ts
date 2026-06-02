"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { revalidatePath } from "next/cache";

/* ────────────────────────────────────────────────────────────── */
/* Building-level opening balance                               */
/* ────────────────────────────────────────────────────────────── */

// One-time onboarding number — total cash + bank money the society had
// when they started using Pulse. Cash Book + Day Book "All combined"
// views fold this into the base opening so the running balance reflects
// pre-Pulse reality without forcing admins to backfill years of
// historical transactions.
export type OpeningBalanceInput = {
  amount: number;
  date: string; // ISO yyyy-mm-dd
};

function isValidIsoDate(s: string): boolean {
  // yyyy-mm-dd strict — Date() is forgiving (accepts "2026-13-50") so we
  // parse the parts manually and round-trip back to confirm.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function updateOpeningBalance(input: OpeningBalanceInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  // Validate amount — negative opening would imply pre-existing debt
  // which we don't model at this layer; bank accounts can carry it
  // separately if needed.
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Opening balance must be zero or a positive number.");
  }

  // Validate date — strict ISO + not in the future.
  if (!input.date || !isValidIsoDate(input.date)) {
    throw new Error("Pick a valid as-of date.");
  }
  if (input.date > todayIso()) {
    throw new Error("As-of date cannot be in the future.");
  }

  const supabase = await createClient();

  // Capture the previous values first so the audit log records what
  // changed — critical if a society later disputes their starting
  // figure months down the line. We log fund_balance too because the
  // RPC dual-writes that column.
  const { data: previous, error: readErr } = await supabase
    .from("bms_buildings")
    .select("opening_balance_amount, opening_balance_date, fund_balance")
    .eq("id", buildingId)
    .single();
  if (readErr) throw new Error(readErr.message);

  // Write via a narrow SECURITY DEFINER RPC instead of direct UPDATE.
  // The RPC whitelists the three opening-balance columns, validates
  // role/tenant/demo/amount/date, and writes both opening_balance_amount
  // and the legacy `fund_balance` column in one transaction so the older
  // dashboards (admin home "Cash available", super_admin views,
  // transparency, finance.ts) reflect immediately.
  const { error: updErr } = await supabase.rpc("bms_update_opening_balance", {
    p_amount: amount,
    p_date: input.date,
  });
  if (updErr) throw new Error(updErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "building.opening_balance.update",
    entity: "building",
    entity_id: buildingId,
    meta: {
      before: {
        opening_balance_amount: Number(previous?.opening_balance_amount ?? 0),
        opening_balance_date: previous?.opening_balance_date ?? null,
        fund_balance: Number(previous?.fund_balance ?? 0),
      },
      after: {
        opening_balance_amount: amount,
        opening_balance_date: input.date,
        fund_balance: amount,
      },
    },
  });

  // Surfaces that read the opening balance: Settings (the form itself),
  // Reports tree (Cash Book + Day Book), the admin/super_admin dashboards
  // reading the legacy `fund_balance` column, super_admin building list +
  // detail pages, and the resident transparency page.
  revalidatePath("/admin/settings");
  revalidatePath("/admin/reports", "layout");
  revalidatePath("/admin");
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/buildings");
  revalidatePath(`/super-admin/buildings/${buildingId}`);
  revalidatePath("/resident/transparency");
}

/* ────────────────────────────────────────────────────────────── */
/* Building info (city)                                          */
/* ────────────────────────────────────────────────────────────── */

// City drives the Bill Accounts provider preset list. We expose this in
// a tiny "Building Info" panel on Settings so admins can pick which
// regional utilities show up.
//
// Admin can't UPDATE bms_buildings directly (write policy is super_admin
// only). We funnel through bms_update_building_info — a SECURITY DEFINER
// RPC that whitelists the city column and validates role + demo flag.
export type BuildingInfoInput = { city: string };

export async function updateBuildingInfo(input: BuildingInfoInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const city = input.city?.trim();
  if (!city) throw new Error("City is required");

  const supabase = await createClient();

  // Capture previous city for the audit trail.
  const { data: previous, error: readErr } = await supabase
    .from("bms_buildings")
    .select("city")
    .eq("id", buildingId)
    .single();
  if (readErr) throw new Error(readErr.message);

  const { error: updErr } = await supabase.rpc("bms_update_building_info", {
    p_city: city,
  });
  if (updErr) throw new Error(updErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "building.info.update",
    entity: "building",
    entity_id: buildingId,
    meta: {
      before: { city: previous?.city ?? null },
      after: { city },
    },
  });

  // Settings shows the form. Bill Accounts page rebuilds the provider
  // dropdown from city → both need busting.
  revalidatePath("/admin/settings");
  revalidatePath("/admin/bill-accounts");
}

/* ────────────────────────────────────────────────────────────── */
/* Resident transparency toggles                                */
/* ────────────────────────────────────────────────────────────── */

export type TransparencySettingsInput = {
  show_building_funds: boolean;
  show_fund_balance: boolean;
  show_defaulters: boolean;
};

export async function updateTransparencySettings(
  input: TransparencySettingsInput,
) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();

  const { data: previous, error: readErr } = await supabase
    .from("bms_buildings")
    .select("show_building_funds, show_fund_balance, show_defaulters")
    .eq("id", buildingId)
    .single();
  if (readErr) throw new Error(readErr.message);

  const { error: updErr } = await supabase.rpc(
    "bms_update_transparency_settings",
    {
      p_show_building_funds: input.show_building_funds,
      p_show_defaulters: input.show_defaulters,
      p_show_fund_balance: input.show_fund_balance,
    },
  );
  if (updErr) throw new Error(updErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "building.transparency.update",
    entity: "building",
    entity_id: buildingId,
    meta: {
      before: {
        show_building_funds: previous?.show_building_funds ?? false,
        show_fund_balance: previous?.show_fund_balance ?? false,
        show_defaulters: previous?.show_defaulters ?? false,
      },
      after: {
        show_building_funds: input.show_building_funds,
        show_fund_balance: input.show_fund_balance,
        show_defaulters: input.show_defaulters,
      },
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/resident/transparency");
}
