import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { createClient } from "@/lib/supabase/server";
import { getUtilityTypes, getUtilityAccounts } from "@/app/actions/utilities";
import { UtilitiesClient } from "@/components/admin/utilities/utilities-client";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

export default function UtilitiesPage() {
  return (
    <div className="space-y-4 animate-fade-up">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <UtilitiesContent />
      </Suspense>
    </div>
  );
}

async function UtilitiesContent() {
  await requireRole(["admin", "super_admin"]);

  const buildingId = await getActiveBuilding();
  if (!buildingId) {
    notFound();
  }

  const supabase = await createClient();

  const [types, accounts, { data: flatsData }] = await Promise.all([
    getUtilityTypes(buildingId),
    getUtilityAccounts(buildingId),
    supabase
      .from("bms_flats")
      .select("id, flat_number, floor")
      .eq("building_id", buildingId)
      .eq("is_active", true)
      .order("flat_number"),
  ]);

  const flats = (flatsData ?? []).map((f) => ({
    id: f.id as string,
    flat_number: f.flat_number as string,
    floor: f.floor as number | null,
  }));

  return (
    <>
      <h1>Utility Bill Numbers</h1>
      <UtilitiesClient
        types={types}
        accounts={accounts}
        flats={flats}
      />
    </>
  );
}
