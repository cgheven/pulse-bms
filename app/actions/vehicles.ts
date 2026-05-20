"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import type { VehicleType } from "@/types";

const VEHICLE_TYPES: VehicleType[] = ["car", "bike", "ev", "other"];

export type VehicleInput = {
  /** Required for admin/super_admin creating on behalf of a resident. Ignored for residents (derived from session). */
  flat_id?: string;
  /** Optional for admin (defaults to null); ignored for residents (derived from session). */
  resident_id?: string | null;
  plate_number: string;
  vehicle_type: VehicleType;
  make?: string | null;
  model?: string | null;
  color?: string | null;
  is_primary?: boolean;
  notes?: string | null;
};

export type VehicleSearchRow = {
  id: string;
  building_id: string;
  flat_id: string;
  resident_id: string | null;
  plate_number: string;
  vehicle_type: VehicleType;
  make: string | null;
  model: string | null;
  color: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  flat_number: string | null;
  resident_name: string | null;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Validation helpers
 * ────────────────────────────────────────────────────────────────────────── */

function normalizePlate(raw: string): string {
  return raw.trim().toUpperCase();
}

function clipText(value: string | null | undefined, max = 100): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function validateCore(input: VehicleInput) {
  const plate = normalizePlate(input.plate_number ?? "");
  if (!plate) throw new Error("Number plate is required");
  if (plate.length > 20) throw new Error("Number plate must be 20 characters or fewer");
  if (!VEHICLE_TYPES.includes(input.vehicle_type)) {
    throw new Error("Vehicle type must be one of car, bike, ev, other");
  }
  return {
    plate_number: plate,
    vehicle_type: input.vehicle_type,
    make: clipText(input.make),
    model: clipText(input.model),
    color: clipText(input.color),
    is_primary: input.is_primary ?? false,
    notes: clipText(input.notes, 500),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Resolve the current resident's primary flat + resident row.
 * Residents can have multiple bms_residents rows (e.g. owner of one flat,
 * tenant of another) — we use the primary-flag ordering then move-in date.
 * ────────────────────────────────────────────────────────────────────────── */
async function resolveResidentContext(buildingId: string, profileId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bms_residents")
    .select("id, flat_id, building_id")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .eq("building_id", buildingId)
    .order("is_primary", { ascending: false })
    .order("move_in_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) {
    throw new Error("No active resident record found for your account.");
  }
  return { residentId: data.id as string, flatId: data.flat_id as string };
}

/* ──────────────────────────────────────────────────────────────────────────
 * createVehicle — resident OR admin
 *   - admin/super_admin must supply flat_id (resident_id optional)
 *   - resident: flat_id + resident_id derived from session
 * ────────────────────────────────────────────────────────────────────────── */
export async function createVehicle(input: VehicleInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin", "resident"]);
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();
  const core = validateCore(input);

  let flat_id: string;
  let resident_id: string | null;

  if (profile.role === "resident") {
    const ctx = await resolveResidentContext(profile.building_id, profile.id);
    flat_id = ctx.flatId;
    resident_id = ctx.residentId;
  } else {
    if (!input.flat_id) throw new Error("Flat is required");
    flat_id = input.flat_id;
    resident_id = input.resident_id ?? null;

    // Cross-tenant guard: flat must belong to caller's building (super_admin bypasses)
    if (profile.role !== "super_admin") {
      const { data: flat } = await supabase
        .from("bms_flats")
        .select("id, building_id")
        .eq("id", flat_id)
        .eq("building_id", profile.building_id)
        .maybeSingle();
      if (!flat) throw new Error("Flat not found in your building");
    }
    if (resident_id) {
      const { data: res } = await supabase
        .from("bms_residents")
        .select("id, building_id, flat_id")
        .eq("id", resident_id)
        .maybeSingle();
      if (!res) throw new Error("Resident not found");
      if (profile.role !== "super_admin" && res.building_id !== profile.building_id) {
        throw new Error("Resident does not belong to your building");
      }
      if (res.flat_id !== flat_id) {
        throw new Error("Resident is not registered on this flat");
      }
    }
  }

  // If is_primary, demote any other primary vehicles on the same flat
  if (core.is_primary) {
    await supabase
      .from("bms_vehicles")
      .update({ is_primary: false })
      .eq("flat_id", flat_id);
  }

  const payload = {
    building_id: profile.building_id,
    flat_id,
    resident_id,
    plate_number: core.plate_number,
    vehicle_type: core.vehicle_type,
    make: core.make,
    model: core.model,
    color: core.color,
    is_primary: core.is_primary,
    notes: core.notes,
    created_by: user.id,
  };

  const { data, error } = await supabase
    .from("bms_vehicles")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "vehicle.create",
    entity: "vehicle",
    entity_id: data.id,
    meta: payload,
  });

  revalidatePath("/admin/vehicles");
  revalidatePath("/resident/vehicles");
  revalidatePath("/union/vehicles");
  return data;
}

/* ──────────────────────────────────────────────────────────────────────────
 * updateVehicle — resident (own only) OR admin (any in building)
 * Residents may not move a vehicle to another flat/resident.
 * ────────────────────────────────────────────────────────────────────────── */
export async function updateVehicle(id: string, input: Partial<VehicleInput>) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin", "resident"]);
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();

  // Load existing for ownership + flat_id (for primary demotion scope)
  const { data: existing, error: loadErr } = await supabase
    .from("bms_vehicles")
    .select("id, building_id, flat_id, resident_id")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!existing) throw new Error("Vehicle not found");

  // Tenant guard
  if (profile.role !== "super_admin" && existing.building_id !== profile.building_id) {
    throw new Error("Vehicle not found in your building");
  }

  // Resident ownership guard
  if (profile.role === "resident") {
    const ctx = await resolveResidentContext(profile.building_id, profile.id);
    if (existing.resident_id !== ctx.residentId) {
      throw new Error("You can only edit your own vehicles.");
    }
  }

  const patch: Record<string, unknown> = {};

  if (input.plate_number !== undefined) {
    const plate = normalizePlate(input.plate_number);
    if (!plate) throw new Error("Number plate is required");
    if (plate.length > 20) throw new Error("Number plate must be 20 characters or fewer");
    patch.plate_number = plate;
  }
  if (input.vehicle_type !== undefined) {
    if (!VEHICLE_TYPES.includes(input.vehicle_type)) {
      throw new Error("Vehicle type must be one of car, bike, ev, other");
    }
    patch.vehicle_type = input.vehicle_type;
  }
  if (input.make !== undefined)  patch.make  = clipText(input.make);
  if (input.model !== undefined) patch.model = clipText(input.model);
  if (input.color !== undefined) patch.color = clipText(input.color);
  if (input.notes !== undefined) patch.notes = clipText(input.notes, 500);
  if (input.is_primary !== undefined) patch.is_primary = input.is_primary;

  // Admin/super_admin may reassign flat or resident; residents cannot.
  if (profile.role !== "resident") {
    if (input.flat_id !== undefined) {
      const { data: flat } = await supabase
        .from("bms_flats")
        .select("id, building_id")
        .eq("id", input.flat_id)
        .maybeSingle();
      if (!flat) throw new Error("Flat not found");
      if (profile.role !== "super_admin" && flat.building_id !== profile.building_id) {
        throw new Error("Flat not in your building");
      }
      patch.flat_id = input.flat_id;
    }
    if (input.resident_id !== undefined) {
      if (input.resident_id) {
        const { data: res } = await supabase
          .from("bms_residents")
          .select("id, building_id, flat_id")
          .eq("id", input.resident_id)
          .maybeSingle();
        if (!res) throw new Error("Resident not found");
        if (profile.role !== "super_admin" && res.building_id !== profile.building_id) {
          throw new Error("Resident not in your building");
        }
        // Resident must be on the flat the vehicle will live on after the update.
        const targetFlat = (patch.flat_id as string | undefined) ?? existing.flat_id;
        if (res.flat_id !== targetFlat) {
          throw new Error("Resident is not registered on this flat");
        }
      }
      patch.resident_id = input.resident_id;
    }
  }

  // Primary demotion on the flat the vehicle will live on after the update
  if (patch.is_primary === true) {
    const targetFlat = (patch.flat_id as string | undefined) ?? existing.flat_id;
    await supabase
      .from("bms_vehicles")
      .update({ is_primary: false })
      .eq("flat_id", targetFlat)
      .neq("id", id);
  }

  const { data, error } = await supabase
    .from("bms_vehicles")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "vehicle.update",
    entity: "vehicle",
    entity_id: id,
    meta: patch,
  });

  revalidatePath("/admin/vehicles");
  revalidatePath("/resident/vehicles");
  revalidatePath("/union/vehicles");
  return data;
}

/* ──────────────────────────────────────────────────────────────────────────
 * deleteVehicle — resident (own) OR admin (any in building)
 * ────────────────────────────────────────────────────────────────────────── */
export async function deleteVehicle(id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin", "resident"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("bms_vehicles")
    .select("id, building_id, resident_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) throw new Error("Vehicle not found");

  if (profile.role !== "super_admin" && existing.building_id !== profile.building_id) {
    throw new Error("Vehicle not found in your building");
  }
  if (profile.role === "resident") {
    const ctx = await resolveResidentContext(profile.building_id, profile.id);
    if (existing.resident_id !== ctx.residentId) {
      throw new Error("You can only delete your own vehicles.");
    }
  }

  const { error } = await supabase.from("bms_vehicles").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "vehicle.delete",
    entity: "vehicle",
    entity_id: id,
  });

  revalidatePath("/admin/vehicles");
  revalidatePath("/resident/vehicles");
  revalidatePath("/union/vehicles");
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
 * searchVehicles — admin OR union. Building-scoped. Joins flat_number + name.
 * Falls back to listing all vehicles when query is empty.
 *
 * Capped at SEARCH_LIMIT rows. If more match, `truncated=true` so the UI can
 * prompt the user to refine. Add pg_trgm + GIN later if substring search at
 * scale becomes a real need.
 * ────────────────────────────────────────────────────────────────────────── */

const SEARCH_LIMIT = 200;

export type VehicleSearchResult = {
  rows: VehicleSearchRow[];
  truncated: boolean;
};

export async function searchVehicles({
  buildingId,
  query,
}: {
  buildingId?: string;
  query?: string;
}): Promise<VehicleSearchResult> {
  const { profile } = await requireRole(["admin", "super_admin", "union"]);
  if (!profile.building_id && profile.role !== "super_admin") {
    throw new Error("No building assigned");
  }

  // Never trust caller-supplied buildingId for non-super_admin
  const effectiveBuilding =
    profile.role === "super_admin"
      ? buildingId ?? profile.building_id
      : profile.building_id;
  if (!effectiveBuilding) throw new Error("Building is required");

  const supabase = await createClient();

  let q = supabase
    .from("bms_vehicles")
    .select(
      "id, building_id, flat_id, resident_id, plate_number, vehicle_type, make, model, color, is_primary, notes, created_at, updated_at, bms_flats(flat_number), bms_residents(full_name)",
    )
    .eq("building_id", effectiveBuilding)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false })
    // Fetch one extra to detect truncation.
    .limit(SEARCH_LIMIT + 1);

  const trimmed = query?.trim() ?? "";
  if (trimmed) {
    // Prefix match — leverages bms_vehicles_plate_unique index on lower(plate_number).
    // Plate searches are typically prefix ("ABC..."). Substring needs pg_trgm GIN later.
    q = q.ilike("plate_number", `${trimmed}%`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Joined = {
    id: string;
    building_id: string;
    flat_id: string;
    resident_id: string | null;
    plate_number: string;
    vehicle_type: VehicleType;
    make: string | null;
    model: string | null;
    color: string | null;
    is_primary: boolean;
    notes: string | null;
    created_at: string;
    updated_at: string;
    bms_flats: { flat_number: string } | { flat_number: string }[] | null;
    bms_residents: { full_name: string } | { full_name: string }[] | null;
  };

  const raw = (data ?? []) as unknown as Joined[];
  const truncated = raw.length > SEARCH_LIMIT;
  const trimmedRows = truncated ? raw.slice(0, SEARCH_LIMIT) : raw;

  const rows = trimmedRows.map((r) => {
    const flat = Array.isArray(r.bms_flats) ? r.bms_flats[0] : r.bms_flats;
    const resident = Array.isArray(r.bms_residents) ? r.bms_residents[0] : r.bms_residents;
    return {
      id: r.id,
      building_id: r.building_id,
      flat_id: r.flat_id,
      resident_id: r.resident_id,
      plate_number: r.plate_number,
      vehicle_type: r.vehicle_type,
      make: r.make,
      model: r.model,
      color: r.color,
      is_primary: r.is_primary,
      notes: r.notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
      flat_number: flat?.flat_number ?? null,
      resident_name: resident?.full_name ?? null,
    };
  });

  return { rows, truncated };
}
