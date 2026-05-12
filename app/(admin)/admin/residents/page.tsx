import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  ResidentsTable,
  type ResidentRow,
} from "@/components/admin/residents/residents-table";

export const dynamic = "force-dynamic";

export default async function ResidentsPage() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Residents</h1>
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  const supabase = await createClient();

  const [{ data: residents }, { data: flats }, { data: building }] = await Promise.all([
    supabase
      .from("bms_residents")
      .select("id, flat_id, full_name, phone, email, cnic, relationship, is_primary, is_active, move_in_date")
      .eq("building_id", profile.building_id)
      .order("is_primary", { ascending: false })
      .order("full_name"),
    supabase
      .from("bms_flats")
      .select("id, flat_number")
      .eq("building_id", profile.building_id)
      .order("flat_number"),
    supabase
      .from("bms_buildings")
      .select("entry_fee_owner, entry_fee_tenant")
      .eq("id", profile.building_id)
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
  }));

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1>Residents</h1>
        <p className="text-muted-foreground">Owners, tenants and family members.</p>
      </div>
      <ResidentsTable
        residents={rows}
        flats={(flats ?? []).map((f) => ({ id: f.id, flat_number: f.flat_number }))}
        buildingDefaults={{
          entry_fee_owner: Number(building?.entry_fee_owner ?? 10000),
          entry_fee_tenant: Number(building?.entry_fee_tenant ?? 5000),
        }}
      />
    </div>
  );
}
