"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/* ─────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────── */

export type VisitorPassResult = {
  id: string;
  plate_number: string;
  visitor_name: string | null;
  expected_from: string;
  expected_until: string;
  notes: string | null;
  resident_name: string;
  flat_number: string;
};

/** Single result row returned from vehicle search. */
export type VehicleLookupRow = {
  plate_number: string;
  vehicle_type: string;
  make: string | null;
  model: string | null;
  color: string | null;
  full_name: string;
  relationship: string;
  flat_number: string;
};

/**
 * Sanitise a raw plate-number query:
 * - Trim whitespace
 * - Strip anything that is not alphanumeric, a dash, or a space
 * - Upper-case (plates are always upper in PK)
 * - Cap at 20 characters
 */
function sanitiseQuery(raw: string): string {
  return raw
    .trim()
    .replace(/[^A-Za-z0-9\- ]/g, "")
    .toUpperCase()
    .slice(0, 20);
}

/**
 * Search vehicles by partial plate number for the guard's building.
 *
 * Guards can only see vehicles registered in their own building.
 * No plate numbers or resident data are ever passed through URL params —
 * the query runs server-side and only the result set is returned to the client.
 */
export async function searchVehicles(
  rawQuery: string,
): Promise<{ data: VehicleLookupRow[]; error: string | null }> {
  try {
    // Guards must be authenticated; any other role is rejected.
    const { profile } = await requireRole("guard");

    if (!profile.building_id) {
      return { data: [], error: "Your account is not assigned to a building. Contact your admin." };
    }

    const query = sanitiseQuery(rawQuery);

    // Empty query → return empty list (no full-table scan).
    if (!query) {
      return { data: [], error: null };
    }

    const supabase = await createClient();

    // Raw SQL via .rpc is cleanest here to express the multi-join, but we use
    // Supabase's PostgREST nested select + filter which is equally safe.
    // The ILIKE pattern is built server-side — never from raw user input.
    const { data, error } = await supabase
      .from("bms_vehicles")
      .select(
        `
        plate_number,
        vehicle_type,
        make,
        model,
        color,
        bms_residents!inner (
          full_name,
          relationship,
          bms_flats!inner (
            flat_number
          )
        )
      `,
      )
      .eq("building_id", profile.building_id)
      .ilike("plate_number", `%${query}%`)
      .order("plate_number")
      .limit(20);

    if (error) {
      console.error("[guard/searchVehicles]", error.message);
      return { data: [], error: "Search failed. Please try again." };
    }

    // Flatten the nested Supabase response into the flat shape the client expects.
    const rows: VehicleLookupRow[] = (data ?? []).map((v) => {
      // Supabase returns joined rows as object or array — handle both.
      const resident = Array.isArray(v.bms_residents)
        ? v.bms_residents[0]
        : v.bms_residents;
      const flat = resident
        ? Array.isArray(resident.bms_flats)
          ? resident.bms_flats[0]
          : resident.bms_flats
        : null;

      return {
        plate_number: v.plate_number ?? "",
        vehicle_type: v.vehicle_type ?? "",
        make: v.make ?? null,
        model: v.model ?? null,
        color: v.color ?? null,
        full_name: resident?.full_name ?? "Unknown",
        relationship: resident?.relationship ?? "unknown",
        flat_number: flat?.flat_number ?? "—",
      };
    });

    return { data: rows, error: null };
  } catch (err) {
    // requireRole throws / redirects — this catches unexpected failures.
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return { data: [], error: message };
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Visitor Pass Actions
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Search for active visitor passes matching a partial plate number.
 * Only returns 'pending' passes that have not yet expired.
 */
export async function getMatchingVisitorPass(
  rawQuery: string,
): Promise<{ data: VisitorPassResult[]; error: string | null }> {
  try {
    const { profile } = await requireRole("guard");

    if (!profile.building_id) {
      return { data: [], error: null };
    }

    const plate = sanitiseQuery(rawQuery);
    if (!plate) return { data: [], error: null };

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("bms_visitor_passes")
      .select(
        `
        id,
        plate_number,
        visitor_name,
        expected_from,
        expected_until,
        notes,
        bms_residents!inner (
          full_name,
          bms_flats!inner (
            flat_number
          )
        )
      `,
      )
      .eq("building_id", profile.building_id)
      .ilike("plate_number", `%${plate}%`)
      .eq("status", "pending")
      .gt("expected_until", new Date().toISOString())
      .order("expected_from", { ascending: true })
      .limit(5);

    if (error) {
      console.error("[guard/getMatchingVisitorPass]", error.message);
      return { data: [], error: "Visitor pass lookup failed." };
    }

    const rows: VisitorPassResult[] = (data ?? []).map((vp) => {
      const resident = Array.isArray(vp.bms_residents)
        ? vp.bms_residents[0]
        : vp.bms_residents;
      const flat = resident
        ? Array.isArray(resident.bms_flats)
          ? resident.bms_flats[0]
          : resident.bms_flats
        : null;

      return {
        id: vp.id,
        plate_number: vp.plate_number,
        visitor_name: vp.visitor_name ?? null,
        expected_from: vp.expected_from,
        expected_until: vp.expected_until,
        notes: vp.notes ?? null,
        resident_name: resident?.full_name ?? "Unknown",
        flat_number: flat?.flat_number ?? "—",
      };
    });

    return { data: rows, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return { data: [], error: message };
  }
}

/**
 * Mark a pending visitor pass as verified by the guard.
 */
export async function verifyVisitorPass(
  passId: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { profile } = await requireRole("guard");

    // Validate UUID format.
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(passId)) {
      return { success: false, error: "Invalid pass ID." };
    }

    if (!profile.building_id) {
      return { success: false, error: "Guard account not assigned to a building." };
    }

    const supabase = await createClient();

    // Fetch and validate the pass before updating.
    const { data: pass, error: fetchError } = await supabase
      .from("bms_visitor_passes")
      .select("id, building_id, status, expected_until")
      .eq("id", passId)
      .single();

    if (fetchError || !pass) {
      return { success: false, error: "Visitor pass not found." };
    }

    if (pass.building_id !== profile.building_id) {
      return { success: false, error: "Visitor pass does not belong to your building." };
    }

    if (pass.status !== "pending") {
      return { success: false, error: "This pass has already been verified or expired." };
    }

    if (new Date(pass.expected_until) < new Date()) {
      return { success: false, error: "This visitor pass has expired." };
    }

    const { error: updateError } = await supabase
      .from("bms_visitor_passes")
      .update({
        status: "verified",
        verified_by: profile.id,
        verified_at: new Date().toISOString(),
      })
      .eq("id", passId);

    if (updateError) {
      console.error("[guard/verifyVisitorPass]", updateError.message);
      return { success: false, error: "Failed to verify pass. Please try again." };
    }

    return { success: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return { success: false, error: message };
  }
}

/**
 * Get all pending visitor passes expected tonight (next 24 hours).
 * Used to show the guard a proactive list of expected visitors.
 */
export async function getPendingPassesTonight(): Promise<{
  data: VisitorPassResult[];
  error: string | null;
}> {
  try {
    const { profile } = await requireRole("guard");

    if (!profile.building_id) {
      return { data: [], error: null };
    }

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("bms_visitor_passes")
      .select(
        `
        id,
        plate_number,
        visitor_name,
        expected_from,
        expected_until,
        notes,
        bms_residents!inner (
          full_name,
          bms_flats!inner (
            flat_number
          )
        )
      `,
      )
      .eq("building_id", profile.building_id)
      .eq("status", "pending")
      .gt("expected_until", now.toISOString())
      .lt("expected_from", in24h.toISOString())
      .order("expected_from", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[guard/getPendingPassesTonight]", error.message);
      return { data: [], error: "Failed to load expected visitors." };
    }

    const rows: VisitorPassResult[] = (data ?? []).map((vp) => {
      const resident = Array.isArray(vp.bms_residents)
        ? vp.bms_residents[0]
        : vp.bms_residents;
      const flat = resident
        ? Array.isArray(resident.bms_flats)
          ? resident.bms_flats[0]
          : resident.bms_flats
        : null;

      return {
        id: vp.id,
        plate_number: vp.plate_number,
        visitor_name: vp.visitor_name ?? null,
        expected_from: vp.expected_from,
        expected_until: vp.expected_until,
        notes: vp.notes ?? null,
        resident_name: resident?.full_name ?? "Unknown",
        flat_number: flat?.flat_number ?? "—",
      };
    });

    return { data: rows, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return { data: [], error: message };
  }
}
