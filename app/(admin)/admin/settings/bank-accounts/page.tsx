import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import { BankAccountsClient } from "./bank-accounts-client";

export const dynamic = "force-dynamic";

export default function BankAccountsPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1>Bank accounts</h1>
        <p className="text-muted-foreground">
          Manage cash drawers and bank accounts for receiving payments and
          paying expenses. Used by the Reports module to compute per-account
          opening / closing balances.
        </p>
      </div>
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("bms_bank_accounts")
    .select(
      "id, name, type, account_number_masked, opening_balance, opening_balance_date, is_active, created_at",
    )
    .eq("building_id", profile.building_id)
    .order("type", { ascending: false })
    .order("name");

  return (
    <BankAccountsClient
      accounts={(accounts ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type as "cash" | "bank",
        account_number_masked: a.account_number_masked,
        opening_balance: Number(a.opening_balance ?? 0),
        opening_balance_date: a.opening_balance_date,
        is_active: !!a.is_active,
        created_at: a.created_at,
      }))}
    />
  );
}
