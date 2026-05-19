import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { searchVehicles } from "@/app/actions/vehicles";
import {
  UnionVehiclesTable,
  type UnionVehicleRow,
} from "@/components/union/vehicles/union-vehicles-table";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

export default function UnionVehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1>Vehicles</h1>
        <p className="text-muted-foreground">
          Registered vehicles across the building. Read-only.
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
  const { profile } = await requireRole("union");
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  const { q } = await searchParams;
  const queryStr = q?.trim() ?? "";

  const { rows: vehicles, truncated } = await searchVehicles({
    buildingId: profile.building_id,
    query: queryStr,
  });

  const rows: UnionVehicleRow[] = vehicles.map((v) => ({
    id: v.id,
    plate_number: v.plate_number,
    vehicle_type: v.vehicle_type,
    make: v.make,
    model: v.model,
    color: v.color,
    is_primary: v.is_primary,
    flat_number: v.flat_number,
    resident_name: v.resident_name,
    created_at: v.created_at,
  }));

  return (
    <>
      <UnionVehiclesTable vehicles={rows} initialQuery={queryStr} />
      {truncated && (
        <p className="text-sm text-muted-foreground mt-3">
          Showing first 200 results. Refine your search to narrow down.
        </p>
      )}
    </>
  );
}
