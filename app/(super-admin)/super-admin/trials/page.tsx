import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TrialsClient } from "./trials-client";

export default async function TrialsPage() {
  const { user, profile } = await requireRole(["super_admin", "sales"]);

  const adminDb = createAdminClient();
  const supabase = await createClient();

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

  // Active leads for the "Fill from Lead" dropdown in CreateDialog.
  // RLS on bms_leads scopes sales users to their own records automatically.
  const { data: leads } = await supabase
    .from("bms_leads")
    .select("id, building_name, city, flat_count_estimate, contact_name, whatsapp_number, email, quoted_amount, status")
    .neq("status", "lost")
    .order("building_name", { ascending: true })
    .limit(200);

  return (
    <TrialsClient
      trials={trials ?? []}
      userRole={profile.role}
      leads={leads ?? []}
    />
  );
}
