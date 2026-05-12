import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";

const NAV = [
  { href: "/union",            label: "Dashboard" },
  { href: "/union/proposals",  label: "Proposals" },
  { href: "/union/meetings",   label: "Meetings" },
  { href: "/union/expenses",   label: "Expenses" },
  { href: "/union/staff",      label: "Staff" },
  { href: "/union/facility",   label: "Facility" },
  { href: "/union/finance",    label: "Finance" },
  { href: "/union/notices",    label: "Notices" },
];

export default async function UnionLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("union");
  const supabase = await createClient();
  let buildingName: string | null = null;
  if (profile.building_id) {
    const { data } = await supabase.from("bms_buildings").select("name").eq("id", profile.building_id).single();
    buildingName = data?.name ?? null;
  }
  return <AppShell profile={profile} buildingName={buildingName} nav={NAV}>{children}</AppShell>;
}
