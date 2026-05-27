import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import { VisitorPassesClient } from "@/components/resident/visitor-passes-client";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default function ResidentVisitorsPage() {
  return (
    <div className="space-y-5 animate-fade-up max-w-3xl">
      <header>
        <h1>Visitor Passes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pre-register expected guests or deliveries so the guard can verify them quickly.
        </p>
      </header>
      <Suspense fallback={<TableSkeleton rows={3} />}>
        <VisitorPassesContent />
      </Suspense>
    </div>
  );
}

async function VisitorPassesContent() {
  const { profile } = await requireRole("resident");

  if (!profile.building_id) {
    return (
      <div className="card-soft text-sm text-muted-foreground">
        No building assigned to your account.
      </div>
    );
  }

  const supabase = await createClient();

  // Resolve all resident records for this user
  const { data: myResidents } = await supabase
    .from("bms_residents")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("building_id", profile.building_id);

  const residentIds = (myResidents ?? []).map((r) => r.id);

  if (residentIds.length === 0) {
    return (
      <div className="card-soft text-sm text-muted-foreground flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 shrink-0" />
        No resident record found. Contact your building admin.
      </div>
    );
  }

  // Fetch passes — most recent first, capped at 50
  const { data: passes } = await supabase
    .from("bms_visitor_passes")
    .select(
      "id, plate_number, visitor_name, expected_from, expected_until, notes, status, verified_at, created_at",
    )
    .in("resident_id", residentIds)
    .order("expected_from", { ascending: false })
    .limit(50);

  return (
    <VisitorPassesClient
      passes={passes ?? []}
      residentIds={residentIds}
    />
  );
}
