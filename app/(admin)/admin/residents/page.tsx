import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { createClient } from "@/lib/supabase/server";
import {
  ResidentsTable,
  type ResidentRow,
} from "@/components/admin/residents/residents-table";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

// SYNC outer — renders shell instantly
export default function ResidentsPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1>Residents</h1>
        <p className="text-muted-foreground">Owners and tenants.</p>
      </div>
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <ResidentsContent />
      </Suspense>
    </div>
  );
}

// ASYNC inner — does all the fetching
async function ResidentsContent() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  const supabase = await createClient();

  const [{ data: residents }, { data: flats }, { data: building }] = await Promise.all([
    supabase
      .from("bms_residents")
      .select("id, flat_id, full_name, phone, email, cnic, relationship, is_primary, is_active, move_in_date, profile_id")
      .eq("building_id", buildingId)
      .order("is_primary", { ascending: false })
      .order("full_name"),
    supabase
      .from("bms_flats")
      .select("id, flat_number")
      .eq("building_id", buildingId)
      .order("flat_number"),
    supabase
      .from("bms_buildings")
      .select("name, entry_fee_owner, entry_fee_tenant")
      .eq("id", buildingId)
      .single(),
  ]);

  const flatMap = new Map((flats ?? []).map((f) => [f.id, f.flat_number]));
  const rows: ResidentRow[] = (residents ?? []).map((r) => ({
    id: r.id,
    flat_id: r.flat_id,
    flat_number: flatMap.get(r.flat_id) ?? "—",
    full_name: r.full_name,
    phone: r.phone,
    email: r.email,
    cnic: r.cnic,
    relationship: r.relationship ?? "owner",
    is_primary: !!r.is_primary,
    is_active: !!r.is_active,
    move_in_date: r.move_in_date,
    profile_id: r.profile_id ?? null,
  }));

  return (
    <ResidentsTable
      residents={rows}
      flats={(flats ?? []).map((f) => ({ id: f.id, flat_number: f.flat_number }))}
      buildingDefaults={{
        entry_fee_owner: Number(building?.entry_fee_owner ?? 10000),
        entry_fee_tenant: Number(building?.entry_fee_tenant ?? 5000),
      }}
      buildingName={building?.name ?? "Building"}
    />
  );
}
