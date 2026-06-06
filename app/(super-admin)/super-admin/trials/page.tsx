import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TrialsClient } from "./trials-client";

export default async function TrialsPage() {
  const { user, profile } = await requireRole(["super_admin", "sales"]);

  const adminDb = createAdminClient();

  let query = adminDb
    .from("bms_buildings")
    .select(
      "id, name, city, is_active, is_trial, trial_ends_at, trial_duration_days, flat_limit, pulse_monthly_charge, created_at, bms_trial_credentials(login_email, login_password)",
    )
    .not("trial_created_by", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  // Sales users see only their own buildings — super_admin sees all
  if (profile.role === "sales") {
    query = query.eq("trial_created_by", user.id);
  }

  const { data: trials } = await query;

  return (
    <TrialsClient
      trials={trials ?? []}
      userRole={profile.role}
    />
  );
}
