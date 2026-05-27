import { Suspense } from "react";
import { CalendarCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { VehicleSearch } from "@/components/guard/vehicle-search";
import { PendingPasses } from "@/components/guard/pending-passes";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import { getPendingPassesTonight } from "@/app/actions/guard";

export const dynamic = "force-dynamic";

async function PendingPassesSection() {
  const { data, error } = await getPendingPassesTonight();
  if (error) return <p className="text-sm text-destructive px-1">{error}</p>;
  return <PendingPasses passes={data} />;
}

export default async function GuardPage() {
  const { profile } = await requireRole("guard");

  return (
    <div className="space-y-6 animate-fade-up max-w-2xl">
      <VehicleSearch buildingId={profile.building_id} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
          <CalendarCheck className="w-3.5 h-3.5" /> Expected Visitors
        </h2>
        <Suspense fallback={<TableSkeleton rows={2} />}>
          <PendingPassesSection />
        </Suspense>
      </section>
    </div>
  );
}
