import { Clock, Lock } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { createAdminClient } from "@/lib/supabase/admin";

export async function TrialBanner() {
  try {
    const session = await getSession();
    if (!session) return null;

    const activeBuildingId = await getActiveBuilding();
    if (!activeBuildingId) return null;

    const adminDb = createAdminClient();
    const { data: building } = await adminDb
      .from("bms_buildings")
      .select("is_trial, is_active, trial_ends_at")
      .eq("id", activeBuildingId)
      .maybeSingle();

    if (!building?.is_trial) return null;

    // Deactivated buildings get the expired treatment
    if (!building.is_active) {
      return (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs font-medium shrink-0">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>Trial deactivated — editing is disabled. Contact your sales representative.</span>
        </div>
      );
    }

    const endsAt = building.trial_ends_at ? new Date(building.trial_ends_at) : null;
    const nowMs = Date.now();
    const daysRemaining = endsAt
      ? Math.ceil((endsAt.getTime() - nowMs) / (1000 * 60 * 60 * 24))
      : null;
    const isExpired = daysRemaining !== null && daysRemaining <= 0;

    if (isExpired) {
      return (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs font-medium shrink-0">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>Trial expired — editing is disabled. Contact your sales representative to extend.</span>
        </div>
      );
    }

    const expiryLabel = endsAt
      ? endsAt.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })
      : null;

    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-medium shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
          <span>
            Demo Trial —{" "}
            <strong>
              {daysRemaining} day{daysRemaining === 1 ? "" : "s"} remaining
            </strong>
          </span>
        </div>
        {expiryLabel && (
          <span className="text-amber-600 hidden sm:block">Expires {expiryLabel}</span>
        )}
      </div>
    );
  } catch {
    // Non-critical — silent degradation if DB is unreachable
    return null;
  }
}
