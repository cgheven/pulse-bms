import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { createClient } from "@/lib/supabase/server";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import { OpeningBalanceForm } from "@/components/admin/settings/opening-balance-form";
import { BuildingInfoForm } from "@/components/admin/settings/building-info-form";
import { TransparencySettingsForm } from "@/components/admin/settings/transparency-settings-form";
import { InvoiceDueDayForm } from "@/components/admin/settings/invoice-due-day-form";
import { BankAccountsClient } from "./bank-accounts-client";

export const dynamic = "force-dynamic";

/**
 * /admin/settings — single settings home. Two sections stacked on one
 * page (Opening Balance + Bank Accounts) so the sidebar stays tight.
 * Add more sections here instead of new top-level routes.
 */
export default function SettingsPage() {
  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1>Settings</h1>
        <p className="text-muted-foreground">
          Configure how your building&rsquo;s money is tracked in Pulse.
        </p>
      </div>

      <section id="building-info" className="space-y-3 scroll-mt-24">
        <div>
          <h2 className="text-xl font-semibold">Building Info</h2>
          <p className="text-sm text-muted-foreground">
            City drives the Bill Accounts provider list. Pick wherever
            your building is registered.
          </p>
        </div>
        <Suspense fallback={<TableSkeleton rows={1} />}>
          <BuildingInfoSection />
        </Suspense>
      </section>

      <section id="opening-fund-balance" className="space-y-3 scroll-mt-24">
        <div>
          <h2 className="text-xl font-semibold">Opening Fund Balance</h2>
          <p className="text-sm text-muted-foreground">
            The total society fund — cash plus bank — on the day you started
            using Pulse. Set this once during onboarding; every running
            balance on reports starts from here.
          </p>
        </div>
        <Suspense fallback={<TableSkeleton rows={2} />}>
          <OpeningBalanceSection />
        </Suspense>
      </section>

      <section id="resident-transparency" className="space-y-3 scroll-mt-24">
        <div>
          <h2 className="text-xl font-semibold">Resident Transparency</h2>
          <p className="text-sm text-muted-foreground">
            Choose what residents can see on their Transparency page. Both sections are
            hidden by default — turn them on when you&rsquo;re ready to share.
          </p>
        </div>
        <Suspense fallback={<TableSkeleton rows={2} />}>
          <TransparencySettingsSection />
        </Suspense>
      </section>

      <section id="billing" className="space-y-3 scroll-mt-24">
        <div>
          <h2 className="text-xl font-semibold">Billing</h2>
          <p className="text-sm text-muted-foreground">
            Controls applied when generating monthly maintenance invoices.
          </p>
        </div>
        <Suspense fallback={<TableSkeleton rows={1} />}>
          <BillingSettingsSection />
        </Suspense>
      </section>

      <section id="bank-accounts" className="space-y-3 scroll-mt-24">
        <div>
          <h2 className="text-xl font-semibold">Bank accounts</h2>
          <p className="text-sm text-muted-foreground">
            Cash drawers and bank accounts used to receive payments and pay
            expenses. Per-account openings aren&rsquo;t tracked here — set
            the society&rsquo;s Opening Fund Balance above.
          </p>
        </div>
        <Suspense fallback={<TableSkeleton rows={4} />}>
          <BankAccountsSection />
        </Suspense>
      </section>
    </div>
  );
}

// --- Building info section --------------------------------------------------

async function BuildingInfoSection() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: building } = await supabase
    .from("bms_buildings")
    .select("city")
    .eq("id", buildingId)
    .single();

  return <BuildingInfoForm initialCity={building?.city ?? null} />;
}

// --- Billing settings section -----------------------------------------------

async function BillingSettingsSection() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: building } = await supabase
    .from("bms_buildings")
    .select("invoice_due_day")
    .eq("id", buildingId)
    .single();

  return <InvoiceDueDayForm initial={Number(building?.invoice_due_day ?? 10)} />;
}

// --- Opening balance section ------------------------------------------------

async function OpeningBalanceSection() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: building } = await supabase
    .from("bms_buildings")
    .select("id, opening_balance_amount, opening_balance_date")
    .eq("id", buildingId)
    .single();

  const amount = Number(building?.opening_balance_amount ?? 0);
  const date =
    building?.opening_balance_date ?? new Date().toISOString().slice(0, 10);

  // Count transactions on or after the opening date — used by the form to
  // warn admins that changing the seed shifts historical running balances.
  const [payments, expenses, salaries] = await Promise.all([
    supabase
      .from("bms_payments")
      .select("id", { count: "exact", head: true })
      .eq("building_id", buildingId)
      .gte("payment_date", date),
    supabase
      .from("bms_expenses")
      .select("id", { count: "exact", head: true })
      .eq("building_id", buildingId)
      .gte("expense_date", date),
    supabase
      .from("bms_salary_payments")
      .select("id", { count: "exact", head: true })
      .eq("building_id", buildingId)
      .gte("payment_date", date),
  ]);

  const txnCount =
    (payments.count ?? 0) + (expenses.count ?? 0) + (salaries.count ?? 0);

  return (
    <OpeningBalanceForm
      initialAmount={amount}
      initialDate={date}
      transactionCount={txnCount}
    />
  );
}

// --- Transparency settings section -----------------------------------------

async function TransparencySettingsSection() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: building } = await supabase
    .from("bms_buildings")
    .select("show_fund_balance, show_building_funds, show_defaulters")
    .eq("id", buildingId)
    .single();

  return (
    <TransparencySettingsForm
      initialShowFundBalance={building?.show_fund_balance ?? false}
      initialShowBuildingFunds={building?.show_building_funds ?? false}
      initialShowDefaulters={building?.show_defaulters ?? false}
    />
  );
}

// --- Bank accounts section --------------------------------------------------

async function BankAccountsSection() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) {
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
    .eq("building_id", buildingId)
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
