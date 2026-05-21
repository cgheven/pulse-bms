import { Suspense } from "react";
import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rangeFromSearchParams } from "@/lib/reports/date-range";
import { ReportTabs } from "@/components/admin/reports/report-tabs";
import { ReportSkeleton } from "@/components/admin/reports/report-skeleton";
import { CashPositionClient } from "./cash-position-client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string }>;

// OUTER server component — sync, paints heading + tabs INSTANTLY on tab
// click. Inner async component below fetches data inside Suspense.
export default function CashPositionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="space-y-1">
        <h1>Reports</h1>
        <p className="text-muted-foreground text-sm">
          Accountant-grade reports — live preview, column picker, CSV and PDF.
        </p>
      </div>
      <ReportTabs active="cash-position" />
      <Suspense fallback={<ReportSkeleton />}>
        <CashPositionData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CashPositionData({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { profile } = await requireRole(["admin", "super_admin", "union"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const sp = await searchParams;
  const dateRange = rangeFromSearchParams(sp);

  const supabase = await createClient();
  const buildingName = (await getCurrentBuildingName()) ?? "Building";

  // Cash Position needs ALL movements up to dateRange.to: rows BEFORE
  // dateRange.from contribute to the opening balance on the first day,
  // rows within the range contribute to daily/monthly deltas. We DON'T
  // gte(from) — we still need history to compute opening_on(from).
  // We DO lte(to) so we don't drag in future rows admins haven't seen yet
  // (e.g. post-dated salary entries).
  //
  // We also pull the building-level opening (a single onboarding number
  // for societies that joined Pulse mid-fiscal-year) so the "All combined"
  // view can seed the running balance without forcing years of imports.
  const [
    { data: building },
    { data: bankAccounts },
    { data: payments },
    { data: expenses },
    { data: salaryPayments },
  ] = await Promise.all([
    supabase
      .from("bms_buildings")
      .select("opening_balance_amount, opening_balance_date")
      .eq("id", profile.building_id)
      .single(),
    supabase
      .from("bms_bank_accounts")
      .select(
        "id, name, type, opening_balance, opening_balance_date, is_active",
      )
      .eq("building_id", profile.building_id)
      .order("type", { ascending: false })
      .order("name"),
    supabase
      .from("bms_payments")
      .select("id, payment_date, amount, bank_account_id")
      .eq("building_id", profile.building_id)
      .lte("payment_date", dateRange.to),
    supabase
      .from("bms_expenses")
      .select("id, expense_date, amount, bank_account_id")
      .eq("building_id", profile.building_id)
      .lte("expense_date", dateRange.to),
    supabase
      .from("bms_salary_payments")
      .select("id, payment_date, amount, bank_account_id")
      .eq("building_id", profile.building_id)
      .lte("payment_date", dateRange.to),
  ]);

  return (
    <CashPositionClient
      buildingName={buildingName}
      initialDateRange={dateRange}
      buildingOpening={Number(building?.opening_balance_amount ?? 0)}
      buildingOpeningDate={
        building?.opening_balance_date ?? new Date().toISOString().slice(0, 10)
      }
      bankAccounts={(bankAccounts ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        type: b.type as "cash" | "bank",
        opening_balance: Number(b.opening_balance ?? 0),
        opening_balance_date: b.opening_balance_date,
        is_active: !!b.is_active,
      }))}
      payments={(payments ?? []).map((p) => ({
        id: p.id,
        date: p.payment_date,
        amount: Number(p.amount ?? 0),
        bank_account_id: p.bank_account_id ?? null,
      }))}
      expenses={[
        ...(expenses ?? []).map((e) => ({
          id: e.id,
          date: e.expense_date,
          amount: Number(e.amount ?? 0),
          bank_account_id: e.bank_account_id ?? null,
        })),
        ...(salaryPayments ?? []).map((s) => ({
          id: s.id,
          date: s.payment_date,
          amount: Number(s.amount ?? 0),
          bank_account_id: s.bank_account_id ?? null,
        })),
      ]}
    />
  );
}
