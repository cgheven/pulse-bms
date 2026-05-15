import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import { ListingsPanel } from "@/components/resident/listings-panel";
import { Home } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ResidentListingsPage() {
  await requireRole("resident");

  return (
    <div className="space-y-5 animate-fade-up max-w-4xl">
      <header>
        <h1>My Listings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Put your flat up for rent or sale. Listings appear on the public{" "}
          <span className="text-foreground font-medium">/find</span> page once
          your building&rsquo;s Union has switched on public listings.
        </p>
      </header>

      <Suspense fallback={<TableSkeleton rows={3} />}>
        <ListingsContent />
      </Suspense>
    </div>
  );
}

async function ListingsContent() {
  const { profile, user } = await requireRole("resident");
  const supabase = await createClient();

  if (!profile.building_id) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <Home className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No building assigned to your account.
        </p>
      </div>
    );
  }

  // Flats this resident owns (not tenant — listings are for owners only)
  const { data: ownedRows } = await supabase
    .from("bms_residents")
    .select(
      "flat_id, bms_flats(id, flat_number, floor, block, monthly_fee, ownership_type)",
    )
    .eq("profile_id", user.id)
    .eq("relationship", "owner")
    .eq("is_active", true);

  type FlatLite = {
    id: string;
    flat_number: string;
    floor: number | null;
    block: string | null;
    monthly_fee: number | null;
    ownership_type: string;
  };
  type Joined = { flat_id: string; bms_flats: FlatLite | FlatLite[] | null };
  const flats: FlatLite[] = ((ownedRows ?? []) as unknown as Joined[])
    .map((r) => (Array.isArray(r.bms_flats) ? r.bms_flats[0] : r.bms_flats))
    .filter((f): f is FlatLite => !!f);

  if (flats.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <Home className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">
          You don&rsquo;t own any flat in this building.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Only flat owners can publish rent or sale listings. Tenants can&rsquo;t.
        </p>
      </div>
    );
  }

  // Building toggle state — show admin disclosure if listing_enabled is off
  const { data: building } = await supabase
    .from("bms_buildings")
    .select("listing_enabled, public_whatsapp")
    .eq("id", profile.building_id)
    .maybeSingle();

  // Active listings (one max per flat) for this resident's owned flats
  const flatIds = flats.map((f) => f.id);
  const { data: existing } = await supabase
    .from("bms_flat_listings")
    .select(
      "id, flat_id, listing_type, price, bedrooms, bathrooms, parking, furnished, description, is_active, updated_at",
    )
    .in("flat_id", flatIds)
    .eq("is_active", true);

  type ListingLite = {
    id: string;
    flat_id: string;
    listing_type: "rent" | "sell";
    price: number;
    bedrooms: number | null;
    bathrooms: number | null;
    parking: boolean;
    furnished: boolean;
    description: string | null;
    is_active: boolean;
    updated_at: string;
  };
  const listingByFlat = new Map<string, ListingLite>();
  for (const l of (existing ?? []) as ListingLite[]) {
    listingByFlat.set(l.flat_id, l);
  }

  return (
    <ListingsPanel
      flats={flats.map((f) => ({
        id: f.id,
        flat_number: f.flat_number,
        floor: f.floor,
        block: f.block,
        existing: listingByFlat.get(f.id) ?? null,
      }))}
      buildingListingEnabled={Boolean(building?.listing_enabled)}
      buildingHasWhatsapp={Boolean(building?.public_whatsapp)}
    />
  );
}
