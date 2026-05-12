import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";

const NAV = [
  { href: "/resident",             label: "Home" },
  { href: "/resident/dues",        label: "My Dues" },
  { href: "/resident/payments",    label: "Payments" },
  { href: "/resident/complaints",  label: "Complaints" },
  { href: "/resident/transparency",label: "Building Finance" },
  { href: "/resident/notices",     label: "Notices" },
];

export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("resident");
  const supabase = await createClient();
  let buildingName: string | null = null;
  if (profile.building_id) {
    const { data } = await supabase.from("bms_buildings").select("name").eq("id", profile.building_id).single();
    buildingName = data?.name ?? null;
  }
  return <AppShell profile={profile} buildingName={buildingName} nav={NAV}>{children}</AppShell>;
}
