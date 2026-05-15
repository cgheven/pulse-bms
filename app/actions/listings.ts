"use server";

import { cache } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

// RFC4122 UUID — used to guard public buildingId path params.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ──────────────────────────────────────────────────────────────────────────
 * Listing management — owners (or admins on their behalf) publish a flat
 * for rent or sell. Auto-publish: the moment they save, the row is live on
 * /find provided the building's listing_enabled master switch is on.
 *
 * Single-active-listing-per-flat is enforced at the DB level by the partial
 * unique index `bms_flat_listings_one_active_per_flat`. We keep that contract
 * by deactivating the previous active row before inserting a new one.
 * ────────────────────────────────────────────────────────────────────────── */

export type ListingInput = {
  flat_id: string;
  listing_type: "rent" | "sell";
  price: number;
  bedrooms?: number | null;
  bathrooms?: number | null;
  parking?: boolean;
  furnished?: boolean;
  description?: string | null;
};

export type ListingRow = {
  id: string;
  building_id: string;
  flat_id: string;
  listing_type: "rent" | "sell";
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: boolean;
  furnished: boolean;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function upsertListing(input: ListingInput): Promise<ListingRow> {
  const { profile, user } = await requireRole(["resident", "admin", "super_admin"]);
  const supabase = await createClient();

  // Client-side guard rails (the RPC re-validates server-side):
  if (!Number.isFinite(input.price) || input.price <= 0)
    throw new Error("Price must be greater than zero");
  if (input.price > 1_000_000_000)
    throw new Error("Price is unrealistically high");
  if (input.listing_type !== "rent" && input.listing_type !== "sell")
    throw new Error("Invalid listing type");
  const bedrooms =
    input.bedrooms === null || input.bedrooms === undefined
      ? null
      : Number(input.bedrooms);
  const bathrooms =
    input.bathrooms === null || input.bathrooms === undefined
      ? null
      : Number(input.bathrooms);
  if (bedrooms !== null && (!Number.isFinite(bedrooms) || bedrooms < 0 || bedrooms > 50))
    throw new Error("Bedrooms must be 0-50");
  if (bathrooms !== null && (!Number.isFinite(bathrooms) || bathrooms < 0 || bathrooms > 50))
    throw new Error("Bathrooms must be 0-50");
  const description = (input.description ?? "").trim().slice(0, 500);

  // Single transactional RPC: row-locks the flat, deactivates any live row,
  // inserts the new one. Eliminates the race condition where two concurrent
  // calls could leave zero active listings or trip the unique index.
  const { data, error } = await supabase.rpc("bms_upsert_listing", {
    p_flat_id: input.flat_id,
    p_listing_type: input.listing_type,
    p_price: input.price,
    p_bedrooms: bedrooms,
    p_bathrooms: bathrooms,
    p_parking: Boolean(input.parking),
    p_furnished: Boolean(input.furnished),
    p_description: description,
  });
  if (error) throw new Error(error.message);
  const row = data as ListingRow;

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: row.building_id,
    action: "listing.create",
    entity: "listing",
    entity_id: row.id,
    meta: {
      listing_type: row.listing_type,
      price: Number(row.price),
    },
  });

  revalidatePath("/resident/listings");
  revalidatePath("/resident");
  revalidatePath("/admin/flats");
  revalidatePath("/find");
  revalidatePath(`/find/${row.building_id}`);
  return row;
}

export async function deactivateListing(listingId: string): Promise<void> {
  const { profile, user } = await requireRole(["resident", "admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { data: row, error: rErr } = await supabase
    .from("bms_flat_listings")
    .select("id, building_id, flat_id, listed_by, listing_type, is_active")
    .eq("id", listingId)
    .single();
  if (rErr || !row) throw new Error("Listing not found");
  if (row.building_id !== profile.building_id)
    throw new Error("Listing belongs to a different building");
  // Idempotent: re-removing an already-inactive row is a silent no-op so the
  // UI doesn't get confused after a stale render.
  if (row.is_active === false) return;

  if (profile.role === "resident") {
    const { data: res } = await supabase
      .from("bms_residents")
      .select("id")
      .eq("flat_id", row.flat_id)
      .eq("profile_id", user.id)
      .eq("relationship", "owner")
      .eq("is_active", true)
      .maybeSingle();
    if (!res) throw new Error("You can only remove your own listing.");
  }

  const { error } = await supabase
    .from("bms_flat_listings")
    .update({ is_active: false })
    .eq("id", listingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "listing.remove",
    entity: "listing",
    entity_id: listingId,
  });

  revalidatePath("/resident/listings");
  revalidatePath("/resident");
  revalidatePath("/admin/flats");
  revalidatePath("/find");
  revalidatePath(`/find/${profile.building_id}`);
}

/* ──────────────────────────────────────────────────────────────────────────
 * Public discovery — uses admin client so no auth/RLS dance for anon users.
 * Returns only buildings where listing_enabled = true AND that have at least
 * one active listing.
 * ────────────────────────────────────────────────────────────────────────── */

export type PublicBuildingCard = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  rent_count: number;
  sell_count: number;
  rent_from: number | null; // lowest rent price
  sell_from: number | null; // lowest sell price
};

// React.cache so generateMetadata + page render share a single query when
// both call this within the same request.
export const getPublicBuildings = cache(async (): Promise<PublicBuildingCard[]> => {
  // Public anon client — RLS + the column-whitelist views are the boundary.
  // No service-role here; a misconfigured query physically cannot leak
  // finance fields like fund_balance / entry_fee_*.
  const pub = createPublicClient();

  const [{ data: listings, error: lErr }, { data: buildings, error: bErr }] =
    await Promise.all([
      pub
        .from("bms_flat_listings_public")
        .select("building_id, listing_type, price"),
      pub
        .from("bms_buildings_public")
        .select("id, name, address, city"),
    ]);

  if (lErr) console.error("[getPublicBuildings] listings error", lErr);
  if (bErr) console.error("[getPublicBuildings] buildings error", bErr);

  type BuildingLite = {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
  };
  const buildingById = new Map<string, BuildingLite>(
    (buildings ?? []).map((b) => [b.id, b as BuildingLite]),
  );

  const byBuilding = new Map<string, PublicBuildingCard>();
  for (const r of listings ?? []) {
    const b = buildingById.get(r.building_id);
    if (!b) continue;
    const price = Number(r.price);
    if (!Number.isFinite(price)) continue;
    const existing = byBuilding.get(b.id) ?? {
      id: b.id,
      name: b.name,
      address: b.address,
      city: b.city,
      rent_count: 0,
      sell_count: 0,
      rent_from: null,
      sell_from: null,
    };
    if (r.listing_type === "rent") {
      existing.rent_count += 1;
      existing.rent_from =
        existing.rent_from == null ? price : Math.min(existing.rent_from, price);
    } else {
      existing.sell_count += 1;
      existing.sell_from =
        existing.sell_from == null ? price : Math.min(existing.sell_from, price);
    }
    byBuilding.set(b.id, existing);
  }
  return Array.from(byBuilding.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
});

export type PublicBuildingDetail = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  public_whatsapp: string | null;
  total_flats: number;
  monthly_fee_default: number;
  listings: {
    id: string;
    flat_number: string;
    floor: number | null;
    block: string | null;
    listing_type: "rent" | "sell";
    price: number;
    bedrooms: number | null;
    bathrooms: number | null;
    parking: boolean;
    furnished: boolean;
    description: string | null;
  }[];
};

// React.cache so generateMetadata + the page server component share one DB
// roundtrip per request (was 2x duplicate queries → 1x). Both call sites
// reach here with the same buildingId in the same render.
//
// Accepts EITHER a raw UUID or a pretty slug like "sunrise-apartments-9d4e38".
// We hex-suffix match against the building id so old UUID URLs keep working.
const HEX_SUFFIX_RE = /^[0-9a-f]{4,16}$/i;

export const getPublicBuildingDetail = cache(
  async (idOrSlug: string): Promise<PublicBuildingDetail | null> => {
    const pub = createPublicClient();

    // Resolve identifier → real id. UUID is direct; slug is matched by the
    // trailing hex suffix via a SECURITY DEFINER resolver RPC because
    // PostgREST won't let anon filter on `id::text` expressions.
    let buildingId: string | null = null;
    if (UUID_RE.test(idOrSlug)) {
      buildingId = idOrSlug;
    } else {
      const suffix = idOrSlug.split("-").pop() ?? "";
      if (!HEX_SUFFIX_RE.test(suffix)) return null;
      const { data: resolved } = await pub.rpc(
        "bms_resolve_building_by_suffix",
        { p_suffix: suffix },
      );
      if (!resolved) return null;
      buildingId = resolved as string;
    }
    if (!buildingId) return null;

    // Parallelize building + listings + flats. View-level RLS narrows everything.
    const [
      { data: building, error: bErr },
      { data: rows, error: lErr },
      { data: flats, error: fErr },
    ] = await Promise.all([
      pub
        .from("bms_buildings_public")
        .select("id, name, address, city, public_whatsapp, total_flats, monthly_fee_default")
        .eq("id", buildingId)
        .maybeSingle(),
      pub
        .from("bms_flat_listings_public")
        .select("id, flat_id, listing_type, price, bedrooms, bathrooms, parking, furnished, description")
        .eq("building_id", buildingId)
        .order("listing_type")
        .order("price"),
      pub
        .from("bms_flats_public")
        .select("id, flat_number, floor, block")
        .eq("building_id", buildingId),
    ]);

    if (bErr) console.error("[getPublicBuildingDetail] building", bErr);
    if (lErr) console.error("[getPublicBuildingDetail] listings", lErr);
    if (fErr) console.error("[getPublicBuildingDetail] flats", fErr);
    if (!building) return null;

    type FlatLite = { id: string; flat_number: string; floor: number | null; block: string | null };
    const flatById = new Map<string, FlatLite>(
      (flats ?? []).map((f) => [f.id, f as FlatLite]),
    );

    const listings = (rows ?? []).map((r) => {
      const f = flatById.get(r.flat_id);
      return {
        id: r.id,
        flat_number: f?.flat_number ?? "—",
        floor: f?.floor ?? null,
        block: f?.block ?? null,
        listing_type: r.listing_type as "rent" | "sell",
        price: Number(r.price),
        bedrooms: r.bedrooms,
        bathrooms: r.bathrooms,
        parking: Boolean(r.parking),
        furnished: Boolean(r.furnished),
        description: r.description,
      };
    });

    return {
      id: building.id,
      name: building.name,
      address: building.address,
      city: building.city,
      public_whatsapp: building.public_whatsapp,
      total_flats: building.total_flats ?? 0,
      monthly_fee_default: Number(building.monthly_fee_default ?? 0),
      listings,
    };
  },
);
