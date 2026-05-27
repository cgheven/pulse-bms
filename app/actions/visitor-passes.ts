"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/* ──────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

export type VisitorPassInput = {
  plate_number: string;
  visitor_name?: string | null;
  expected_from: string; // ISO string from datetime-local
  expected_until: string; // ISO string from datetime-local
  notes?: string | null;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Sanitisation helpers
 * ────────────────────────────────────────────────────────────────────────── */

/** Strip everything except alphanumeric, hyphen, and space; uppercase; trim. */
function normalizePlate(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9\- ]/g, "")
    .trim()
    .toUpperCase();
}

/** Strip HTML-like tags, trim, truncate. Returns null when blank. */
function sanitizeText(raw: string | null | undefined, max: number): string | null {
  if (!raw) return null;
  const stripped = raw.replace(/<[^>]*>/g, "").trim();
  if (!stripped) return null;
  return stripped.slice(0, max);
}

/* ──────────────────────────────────────────────────────────────────────────
 * createVisitorPass
 * ────────────────────────────────────────────────────────────────────────── */

export async function createVisitorPass(input: VisitorPassInput) {
  const { profile } = await requireRole("resident");
  if (!profile.building_id) throw new Error("No building assigned to your account.");

  const supabase = await createClient();

  // --- Resolve resident_id -------------------------------------------------
  const { data: residents } = await supabase
    .from("bms_residents")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("building_id", profile.building_id)
    .eq("is_active", true);

  const residentIds = (residents ?? []).map((r) => r.id);
  if (residentIds.length === 0) {
    throw new Error("No active resident record found. Contact your building admin.");
  }
  const resident_id = residentIds[0]; // use first active record

  // --- Validate plate_number -----------------------------------------------
  const plate = normalizePlate(input.plate_number ?? "");
  if (!plate) throw new Error("Vehicle number plate is required.");
  if (plate.length > 20) throw new Error("Number plate must be 20 characters or fewer.");

  // --- Validate visitor_name -----------------------------------------------
  const visitor_name = sanitizeText(input.visitor_name, 80);

  // --- Validate dates -------------------------------------------------------
  const now = new Date();
  const graceCutoff = new Date(now.getTime() - 15 * 60 * 1000); // now - 15 min
  const maxUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // now + 24 h

  if (!input.expected_from) throw new Error("Expected arrival time is required.");
  if (!input.expected_until) throw new Error("Expected departure time is required.");

  const fromDate = new Date(input.expected_from);
  const untilDate = new Date(input.expected_until);

  if (isNaN(fromDate.getTime())) throw new Error("Invalid expected arrival time.");
  if (isNaN(untilDate.getTime())) throw new Error("Invalid expected departure time.");

  if (fromDate < graceCutoff) {
    throw new Error("Expected arrival cannot be more than 15 minutes in the past.");
  }
  if (untilDate <= fromDate) {
    throw new Error("Expected departure must be after the expected arrival.");
  }
  if (untilDate > maxUntil) {
    throw new Error("Visitor passes can only be created up to 24 hours in advance.");
  }

  // --- Validate notes -------------------------------------------------------
  const notes = sanitizeText(input.notes, 200);

  // --- Rate limit: max 10 pending passes per resident ----------------------
  const { count } = await supabase
    .from("bms_visitor_passes")
    .select("id", { count: "exact", head: true })
    .in("resident_id", residentIds)
    .eq("status", "pending")
    .gt("expected_until", now.toISOString());

  if ((count ?? 0) >= 10) {
    throw new Error(
      "You already have 10 active visitor passes. Cancel an existing one before adding more.",
    );
  }

  // --- Insert ---------------------------------------------------------------
  const { error } = await supabase.from("bms_visitor_passes").insert({
    building_id: profile.building_id,
    resident_id,
    plate_number: plate,
    visitor_name,
    expected_from: fromDate.toISOString(),
    expected_until: untilDate.toISOString(),
    notes,
    status: "pending",
  });

  if (error) throw new Error(error.message);

  revalidatePath("/resident/visitors");
}

/* ──────────────────────────────────────────────────────────────────────────
 * cancelVisitorPass
 * ────────────────────────────────────────────────────────────────────────── */

export async function cancelVisitorPass(passId: string) {
  const { profile } = await requireRole("resident");
  if (!profile.building_id) throw new Error("No building assigned to your account.");

  const supabase = await createClient();

  // Resolve all resident_ids for this user
  const { data: residents } = await supabase
    .from("bms_residents")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("building_id", profile.building_id);

  const residentIds = (residents ?? []).map((r) => r.id);
  if (residentIds.length === 0) throw new Error("No resident record found.");

  // Fetch pass and verify ownership + status
  const { data: pass } = await supabase
    .from("bms_visitor_passes")
    .select("id, resident_id, building_id, status")
    .eq("id", passId)
    .maybeSingle();

  if (!pass) throw new Error("Visitor pass not found.");
  if (pass.building_id !== profile.building_id) throw new Error("Visitor pass not found.");
  if (!residentIds.includes(pass.resident_id)) {
    throw new Error("You can only cancel your own visitor passes.");
  }
  if (pass.status !== "pending") {
    throw new Error("Only pending visitor passes can be cancelled.");
  }

  const { error } = await supabase
    .from("bms_visitor_passes")
    .delete()
    .eq("id", passId);

  if (error) throw new Error(error.message);

  revalidatePath("/resident/visitors");
}
