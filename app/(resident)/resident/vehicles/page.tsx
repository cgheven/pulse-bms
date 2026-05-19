import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  ResidentVehiclesList,
  type ResidentVehicleRow,
} from "@/components/resident/vehicles/resident-vehicles-list";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import type { VehicleType } from "@/types";

export const dynamic = "force-dynamic";

export default function ResidentVehiclesPage() {
  return (
    <div className="space-y-6 animate-fade-up max-w-4xl">
      <header>
        <h1>My Vehicles</h1>
        <p className="text-muted-foreground">
          Your cars, bikes and EVs registered with the building.
        </p>
      </header>
      <Suspense fallback={<TableSkeleton rows={3} />}>
        <VehiclesContent />
      </Suspense>
    </div>
  );
}

async function VehiclesContent() {
  const { profile } = await requireRole("resident");
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const supabase = await createClient();

  // Pull the resident's primary active row to know which resident_id to filter by
  const { data: residentRow } = await supabase
    .from("bms_residents")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("is_active", true)
    .eq("building_id", profile.building_id)
    .order("is_primary", { ascending: false })
    .order("move_in_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!residentRow) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">
          We could not find your resident record. Please ask the admin to link your
          account to your flat.
        </p>
      </div>
    );
  }

  const { data: vehicles } = await supabase
    .from("bms_vehicles")
    .select(
      "id, plate_number, vehicle_type, make, model, color, is_primary, notes",
    )
    .eq("building_id", profile.building_id)
    .eq("resident_id", residentRow.id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  const rows: ResidentVehicleRow[] = (vehicles ?? []).map((v) => ({
    id: v.id,
    plate_number: v.plate_number,
    vehicle_type: v.vehicle_type as VehicleType,
    make: v.make,
    model: v.model,
    color: v.color,
    is_primary: !!v.is_primary,
    notes: v.notes,
  }));

  return <ResidentVehiclesList vehicles={rows} />;
}
