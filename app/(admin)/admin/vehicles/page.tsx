import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { searchVehicles } from "@/app/actions/vehicles";
import { createClient } from "@/lib/supabase/server";
import {
  VehiclesTable,
  type VehicleRow,
} from "@/components/admin/vehicles/vehicles-table";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

export default function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1>Vehicles</h1>
        <p className="text-muted-foreground">
          All cars, bikes and EVs registered in this building.
        </p>
      </div>
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <VehiclesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function VehiclesContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const { q } = await searchParams;
  const queryStr = q?.trim() ?? "";

  const supabase = await createClient();

  const [{ rows: vehicles, truncated }, { data: flats }, { data: residents }] = await Promise.all([
    searchVehicles({ buildingId: profile.building_id, query: queryStr }),
    supabase
      .from("bms_flats")
      .select("id, flat_number")
      .eq("building_id", profile.building_id)
      .order("flat_number"),
    supabase
      .from("bms_residents")
      .select("id, flat_id, full_name")
      .eq("building_id", profile.building_id)
      .eq("is_active", true)
      .order("full_name"),
  ]);

  const rows: VehicleRow[] = vehicles.map((v) => ({
    id: v.id,
    flat_id: v.flat_id,
    resident_id: v.resident_id,
    plate_number: v.plate_number,
    vehicle_type: v.vehicle_type,
    make: v.make,
    model: v.model,
    color: v.color,
    is_primary: v.is_primary,
    notes: v.notes,
    created_at: v.created_at,
    flat_number: v.flat_number,
    resident_name: v.resident_name,
  }));

  return (
    <>
      <VehiclesTable
        vehicles={rows}
        flats={(flats ?? []).map((f) => ({ id: f.id, flat_number: f.flat_number }))}
        residents={(residents ?? []).map((r) => ({
          id: r.id,
          flat_id: r.flat_id,
          full_name: r.full_name,
        }))}
        initialQuery={queryStr}
      />
      {truncated && (
        <p className="text-sm text-muted-foreground mt-3">
          Showing first 200 results. Refine your search to narrow down.
        </p>
      )}
    </>
  );
}
