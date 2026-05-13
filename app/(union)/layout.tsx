import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function UnionLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("union");
  const supabase = await createClient();
  let buildingName: string | null = null;
  if (profile.building_id) {
    const { data } = await supabase
      .from("bms_buildings")
      .select("name")
      .eq("id", profile.building_id)
      .single();
    buildingName = data?.name ?? null;
  }
  return (
    <AppShell profile={profile} buildingName={buildingName}>
      {children}
    </AppShell>
  );
}
