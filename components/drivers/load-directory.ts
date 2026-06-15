import { createClient } from "@/lib/supabase/server";
import type { DirectoryRow } from "@/components/drivers/drivers-directory";

type Joined = { full_name: string } | { full_name: string }[] | null;
type JoinedFlat = { flat_number: string } | { flat_number: string }[] | null;

function one<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Building-wide driver directory rows (admin/union read views). RLS already
 *  limits visibility to building staff; we also filter by building_id. */
export async function loadDriverDirectory(buildingId: string): Promise<DirectoryRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bms_drivers")
    .select(
      "id, full_name, phone, cnic, status, photo_path, bms_residents(full_name), bms_flats(flat_number)",
    )
    .eq("building_id", buildingId)
    .order("status", { ascending: true })
    .order("full_name", { ascending: true });

  return (data ?? []).map((d) => {
    const resident = one(d.bms_residents as Joined);
    const flat = one(d.bms_flats as JoinedFlat);
    return {
      id: d.id,
      full_name: d.full_name,
      phone: d.phone,
      cnic: d.cnic,
      status: d.status,
      has_photo: !!d.photo_path,
      resident_name: resident?.full_name ?? "—",
      flat_number: flat?.flat_number ?? "—",
    };
  });
}
