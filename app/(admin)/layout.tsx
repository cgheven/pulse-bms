import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";

const NAV = [
  { href: "/admin",             label: "Dashboard" },
  { href: "/admin/flats",       label: "Flats" },
  { href: "/admin/residents",   label: "Residents" },
  { href: "/admin/billing",     label: "Billing" },
  { href: "/admin/payments",    label: "Payments" },
  { href: "/admin/staff",       label: "Staff" },
  { href: "/admin/expenses",    label: "Expenses" },
  { href: "/admin/facility",    label: "Facility" },
  { href: "/admin/union",       label: "Union" },
  { href: "/admin/notices",     label: "Notices" },
  { href: "/admin/finance",     label: "Finance" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const supabase = await createClient();
  let buildingName: string | null = null;
  if (profile.building_id) {
    const { data } = await supabase.from("bms_buildings").select("name").eq("id", profile.building_id).single();
    buildingName = data?.name ?? null;
  }
  return <AppShell profile={profile} buildingName={buildingName} nav={NAV}>{children}</AppShell>;
}
