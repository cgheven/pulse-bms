"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { SERVICE_CATEGORIES, type ServiceCategory } from "@/lib/service-categories";
import { revalidatePath } from "next/cache";

export type ServiceInput = {
  id?: string;
  title: string;
  category: ServiceCategory;
  description?: string | null;
  price_note?: string | null;
};

export type ServiceRow = {
  id: string;
  building_id: string;
  profile_id: string;
  resident_id: string | null;
  flat_id: string | null;
  title: string;
  category: ServiceCategory;
  description: string | null;
  price_note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ServiceCard = ServiceRow & {
  seller_name: string;
  seller_phone: string | null;
  flat_number: string | null;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Resident lists their own service. Tenants, owners, family — anyone in the
 * building with an active resident record + linked profile can publish.
 * Update path reuses the same input; identity check happens via profile_id.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Strip control chars, RLO/LRO unicode tricks, and zero-width spaces from
 * free-text fields before they're embedded in the WhatsApp pre-fill
 * template or rendered to other residents. Without this, a malicious user
 * sets `full_name` to "\n\n_Send Rs 5000 to JazzCash 03xxxxxxxxx_\n\n" and
 * weaponizes the buyer's pre-typed WA message into an advance-fee scam.
 */
function sanitizeText(input: string, maxLen: number): string {
  return input
    .replace(/[\x00-\x1F\x7F]/g, " ") // control chars (newlines, tabs, etc.)
    .replace(/[​-‏‪-‮﻿]/g, "") // zero-width + RLO/LRO
    .replace(/\s+/g, " ") // collapse runs of whitespace
    .trim()
    .slice(0, maxLen);
}

export async function upsertMyService(input: ServiceInput): Promise<ServiceRow> {
  await requireNotDemo();
  const { profile, user } = await requireRole(["resident", "admin", "super_admin"]);

  // Resident uses profile.building_id; admin uses active building context.
  let buildingId: string;
  if (profile.role === "resident") {
    if (!profile.building_id) throw new Error("No building assigned");
    buildingId = profile.building_id;
  } else {
    const activeBuildingId = await getActiveBuilding();
    if (!activeBuildingId) throw new Error("No active building selected.");
    buildingId = activeBuildingId;
  }

  const supabase = await createClient();

  // Sanitize free-text — see helper comment.
  const title = sanitizeText(input.title, 100);
  if (title.length < 2)
    throw new Error("Title must be at least 2 characters");
  if (!SERVICE_CATEGORIES.includes(input.category))
    throw new Error("Invalid category");
  const description =
    input.description ? sanitizeText(input.description, 500) : null;
  const price_note =
    input.price_note ? sanitizeText(input.price_note, 80) : null;

  // Resolve the resident row — required for INSERT RLS *and* for the UPDATE
  // path now that RLS demands an active residency.
  const { data: residency } = await supabase
    .from("bms_residents")
    .select("id, flat_id")
    .eq("profile_id", user.id)
    .eq("building_id", buildingId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!residency && profile.role !== "super_admin") {
    throw new Error("Only active residents of the building can publish services");
  }

  if (input.id) {
    // Update path — DO NOT silently reactivate. If admin/policy soft-removed
    // the row, owner editing notes must not republish; they go through the
    // create flow (or a future explicit "Republish" button).
    const { data, error } = await supabase
      .from("bms_services")
      .update({
        title,
        category: input.category,
        description,
        price_note,
      })
      .eq("id", input.id)
      .eq("profile_id", user.id)
      .eq("building_id", buildingId) // cross-building guard
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Service not found, or it isn't yours to edit");

    await writeAuditLog({
      actor_id: user.id,
      actor_email: user.email,
      actor_role: profile.role,
      building_id: buildingId,
      action: "service.update",
      entity: "service",
      entity_id: data.id,
      meta: { title, category: input.category },
    });

    revalidatePath("/resident/services");
    return data as ServiceRow;
  }

  const payload = {
    building_id: buildingId,
    profile_id: user.id,
    resident_id: residency?.id ?? null,
    flat_id: residency?.flat_id ?? null,
    title,
    category: input.category,
    description,
    price_note,
    is_active: true,
  };
  const { data, error } = await supabase
    .from("bms_services")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "service.create",
    entity: "service",
    entity_id: data.id,
    meta: { title, category: input.category },
  });

  revalidatePath("/resident/services");
  return data as ServiceRow;
}

export async function deactivateService(serviceId: string): Promise<void> {
  await requireNotDemo();
  const { profile, user } = await requireRole(["resident", "admin", "super_admin"]);

  // Resident uses profile.building_id; admin uses active building context.
  let buildingId: string;
  if (profile.role === "resident") {
    if (!profile.building_id) throw new Error("No building assigned");
    buildingId = profile.building_id;
  } else {
    const activeBuildingId = await getActiveBuilding();
    if (!activeBuildingId) throw new Error("No active building selected.");
    buildingId = activeBuildingId;
  }

  const supabase = await createClient();

  // Defense in depth — even though RLS UPDATE gates this, scope the WHERE
  // clause so a future RLS regression doesn't silently let a resident
  // soft-delete every neighbor's listing.
  const baseQ = supabase
    .from("bms_services")
    .update({ is_active: false })
    .eq("id", serviceId)
    .eq("building_id", buildingId);

  const { error } =
    profile.role === "admin" || profile.role === "super_admin"
      ? await baseQ
      : await baseQ.eq("profile_id", user.id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "service.remove",
    entity: "service",
    entity_id: serviceId,
  });

  revalidatePath("/resident/services");
}

/* ──────────────────────────────────────────────────────────────────────────
 * Building-scoped service feed. Uses admin client to hydrate seller
 * name/phone/flat number in one shot. RLS guarantees only callers IN this
 * building (or super_admin) can reach this server action via the resident
 * route group — additional checks at the action entry.
 * ────────────────────────────────────────────────────────────────────────── */

export async function getBuildingServices(): Promise<{
  myUserId: string;
  services: ServiceCard[];
}> {
  const { profile, user } = await requireRole(["resident", "admin", "super_admin"]);

  // Resident uses profile.building_id; admin uses active building context.
  let buildingId: string;
  if (profile.role === "resident") {
    if (!profile.building_id) throw new Error("No building assigned");
    buildingId = profile.building_id;
  } else {
    const activeBuildingId = await getActiveBuilding();
    if (!activeBuildingId) throw new Error("No active building selected.");
    buildingId = activeBuildingId;
  }

  // Admin client because we need to denormalize profile (name + phone) and
  // flat (flat_number) — RLS on those tables is restrictive for residents.
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("bms_services")
    .select("*")
    .eq("building_id", buildingId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  const services = (rows ?? []) as ServiceRow[];

  if (services.length === 0) {
    return { myUserId: user.id, services: [] };
  }

  const profileIds = Array.from(new Set(services.map((s) => s.profile_id)));
  const flatIds = Array.from(
    new Set(services.map((s) => s.flat_id).filter(Boolean) as string[]),
  );

  // Always scope the flat lookup by building_id — even though our INSERT path
  // sets flat_id from the resident's record, this is defense in depth.
  const [{ data: profiles }, { data: flats }] = await Promise.all([
    admin
      .from("bms_profiles")
      .select("id, full_name, phone")
      .in("id", profileIds),
    flatIds.length > 0
      ? admin
          .from("bms_flats")
          .select("id, flat_number")
          .eq("building_id", buildingId)
          .in("id", flatIds)
      : Promise.resolve({
          data: [] as { id: string; flat_number: string }[],
          error: null,
        }),
  ]);

  type ProfileLite = { id: string; full_name: string | null; phone: string | null };
  const profileById = new Map<string, ProfileLite>(
    (profiles ?? []).map((p) => [p.id, p as ProfileLite]),
  );
  const flatById = new Map<string, string>(
    (flats ?? []).map((f) => [f.id, f.flat_number]),
  );

  const cards: ServiceCard[] = services.map((s) => {
    const p = profileById.get(s.profile_id);
    // Sanitize seller name before it lands in the WhatsApp pre-fill template
    // on the client. Stops `\n_Send advance to X_\n` style injection.
    const rawName = p?.full_name ?? "Neighbor";
    const seller_name = sanitizeText(rawName, 40) || "Neighbor";
    return {
      ...s,
      seller_name,
      seller_phone: p?.phone ?? null,
      flat_number: s.flat_id ? flatById.get(s.flat_id) ?? null : null,
    };
  });

  return { myUserId: user.id, services: cards };
}
