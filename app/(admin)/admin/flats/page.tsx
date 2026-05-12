import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FlatsTable, type FlatRow } from "@/components/admin/flats/flats-table";

export const dynamic = "force-dynamic";

export default async function FlatsPage() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Flats</h1>
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  const supabase = await createClient();

  const [{ data: flats }, { data: building }, { data: residents }] = await Promise.all([
    supabase
      .from("bms_flats")
      .select("id, flat_number, floor, block, size_sqft, monthly_fee, ownership_type, outstanding_dues, notes")
      .eq("building_id", profile.building_id)
      .order("flat_number"),
    supabase
      .from("bms_buildings")
      .select("monthly_fee_default")
      .eq("id", profile.building_id)
      .single(),
    supabase
      .from("bms_residents")
      .select("flat_id, full_name, is_primary, is_active")
      .eq("building_id", profile.building_id)
      .eq("is_active", true),
  ]);

  const primaryByFlat = new Map<string, string>();
  for (const r of residents ?? []) {
    if (r.is_primary && r.flat_id && !primaryByFlat.has(r.flat_id)) {
      primaryByFlat.set(r.flat_id, r.full_name);
    }
  }
  // Fallback: any resident if no primary
  for (const r of residents ?? []) {
    if (r.flat_id && !primaryByFlat.has(r.flat_id)) {
      primaryByFlat.set(r.flat_id, r.full_name);
    }
  }

  const rows: FlatRow[] = (flats ?? []).map((f) => ({
    id: f.id,
    flat_number: f.flat_number,
    floor: f.floor,
    block: f.block,
    size_sqft: f.size_sqft,
    monthly_fee: f.monthly_fee,
    ownership_type: f.ownership_type,
    outstanding_dues: Number(f.outstanding_dues ?? 0),
    notes: f.notes,
    primary_resident_name: primaryByFlat.get(f.id) ?? null,
  }));

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1>Flats</h1>
        <p className="text-muted-foreground">All units in this building.</p>
      </div>
      <FlatsTable flats={rows} buildingDefaultFee={Number(building?.monthly_fee_default ?? 0)} />
    </div>
  );
}
