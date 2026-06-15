import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DriversClient, type DriverRow } from "@/components/drivers/drivers-client";

export const dynamic = "force-dynamic";

export default async function ResidentDriversPage() {
  await requireRole("resident");
  const supabase = await createClient();

  // RLS scopes this to the caller's own drivers.
  const { data } = await supabase
    .from("bms_drivers")
    .select("id, full_name, phone, cnic, status, photo_path, created_at")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  const drivers: DriverRow[] = (data ?? []).map((d) => ({
    id: d.id,
    full_name: d.full_name,
    phone: d.phone,
    cnic: d.cnic,
    status: d.status,
    has_photo: !!d.photo_path,
  }));

  return (
    <div className="space-y-5 animate-fade-up max-w-5xl">
      <DriversClient drivers={drivers} />
    </div>
  );
}
