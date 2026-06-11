import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import { BuildingSettingsForm } from "@/components/union/building-settings-form";

export const dynamic = "force-dynamic";

export default async function UnionSettingsPage() {
  await requireRole(["union", "admin"]);

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1>Building settings</h1>
        <p className="text-muted-foreground mt-1">
          Set fees, voting rule and utility cut-off for your building. Changes
          take effect immediately for new invoices, votes and defaulter
          reports.
        </p>
      </div>

      <Suspense fallback={<TableSkeleton rows={4} />}>
        <SettingsLoader />
      </Suspense>
    </div>
  );
}

async function SettingsLoader() {
  const { profile } = await requireRole(["union", "admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground">
          No building is assigned to your account.
        </p>
      </div>
    );
  }
  const supabase = await createClient();
  const { data: building, error } = await supabase
    .from("bms_buildings")
    .select(
      "id, name, entry_fee_owner, entry_fee_tenant, monthly_fee_default, utility_cutoff_after_months, invoice_due_day, voting_rule, expose_defaulter_names, listing_enabled, public_whatsapp",
    )
    .eq("id", profile.building_id)
    .single();

  if (error || !building) {
    return (
      <div className="card-soft border-destructive/40 bg-destructive/5 text-destructive">
        Could not load building. Please refresh — if the problem persists, contact support.
      </div>
    );
  }

  return (
    <BuildingSettingsForm
      buildingName={building.name}
      initial={{
        entry_fee_owner: Number(building.entry_fee_owner ?? 0),
        entry_fee_tenant: Number(building.entry_fee_tenant ?? 0),
        monthly_fee_default: Number(building.monthly_fee_default ?? 0),
        utility_cutoff_after_months: Number(
          building.utility_cutoff_after_months ?? 3,
        ),
        invoice_due_day: Number(building.invoice_due_day ?? 10),
        voting_rule:
          building.voting_rule === "unanimous" ? "unanimous" : "majority",
        expose_defaulter_names: Boolean(building.expose_defaulter_names),
        listing_enabled: Boolean(building.listing_enabled),
        public_whatsapp: (building.public_whatsapp ?? "") as string,
      }}
    />
  );
}
