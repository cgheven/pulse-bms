import { requireRole } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { createClient } from "@/lib/supabase/server";
import { getSetupStatus } from "@/app/actions/setup";
import { SetupClient } from "@/components/admin/setup/setup-client";

export const dynamic = "force-dynamic";

/**
 * /admin/setup — Quick Setup: a guided checklist that gets a new building
 * running without hunting through the app. Each step links to the page where
 * the data is created and ticks itself from real data (see getSetupStatus).
 */
export default async function SetupPage() {
  await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  const supabase = await createClient();

  const [status, buildingRes] = await Promise.all([
    getSetupStatus(),
    buildingId
      ? supabase.from("bms_buildings").select("name").eq("id", buildingId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const buildingName =
    (buildingRes.data as { name: string } | null)?.name ?? "your building";

  return <SetupClient status={status} buildingName={buildingName} />;
}
