import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBuildingServices } from "@/app/actions/services";
import { ServicesPanel } from "@/components/resident/services-panel";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

export default function ResidentServicesPage() {
  return (
    <div className="space-y-4 animate-fade-up max-w-6xl">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <ServicesLoader />
      </Suspense>
    </div>
  );
}

async function ServicesLoader() {
  const { profile } = await requireRole("resident");
  const supabase = await createClient();

  // Light building info for header + the WhatsApp message context.
  const { data: building } = profile.building_id
    ? await supabase
        .from("bms_buildings")
        .select("name")
        .eq("id", profile.building_id)
        .maybeSingle()
    : { data: null };

  const { myUserId, services } = await getBuildingServices();

  return (
    <ServicesPanel
      buildingName={building?.name ?? "Your building"}
      myUserId={myUserId}
      services={services}
    />
  );
}
