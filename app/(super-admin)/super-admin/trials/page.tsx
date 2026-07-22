import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TrialsClient } from "./trials-client";

export const dynamic = "force-dynamic";

export default async function TrialsPage() {
  const { user, profile } = await requireRole(["super_admin", "sales"]);

  const adminDb = createAdminClient();
  const supabase = await createClient();

  let query = adminDb
    .from("bms_buildings")
    .select(
      "id, name, city, is_active, is_trial, trial_ends_at, trial_duration_days, flat_limit, pulse_monthly_charge, created_at, bms_trial_credentials(login_email, login_password)",
    )
    .eq("is_trial", true)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: trials } = await query;

  // Active leads for the "Fill from Lead" dropdown in CreateDialog.
  // RLS on bms_leads scopes sales users to their own records automatically.
  const { data: leads } = await supabase
    .from("bms_leads")
    .select("id, building_name, city, flat_count_estimate, contact_name, whatsapp_number, email, quoted_amount, status")
    .neq("status", "lost")
    .order("building_name", { ascending: true })
    .limit(200);

  // Website inquiries (new + contacted) for "Fill from Inquiry" dropdown.
  // Uses adminDb so sales users (who lack an RLS SELECT policy) see the same list.
  const { data: inquiries } = await adminDb
    .from("bms_website_inquiries")
    .select("id, building_name, city, num_flats, president_name, phone, whatsapp, email")
    .in("status", ["new", "contacted"])
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <TrialsClient
      trials={trials ?? []}
      userRole={profile.role}
      leads={leads ?? []}
      inquiries={inquiries ?? []}
    />
  );
}
