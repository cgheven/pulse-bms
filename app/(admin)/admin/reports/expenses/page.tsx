import { Suspense } from "react";
import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rangeFromSearchParams } from "@/lib/reports/date-range";
import { ReportTabs } from "@/components/admin/reports/report-tabs";
import { ReportSkeleton } from "@/components/admin/reports/report-skeleton";
import { ExpensesReportClient } from "./expenses-report-client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string }>;

// OUTER server component — sync, no data dependencies. Paints the page
// chrome (heading + tab strip) INSTANTLY on tab click. The inner async
// component fetches data inside Suspense; the skeleton mirrors the real
// layout so the visual jump on data arrival is minimal.
export default function ExpensesReportPage({
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
      <ReportTabs active="expenses" />
      <Suspense fallback={<ReportSkeleton />}>
        <ExpensesData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ExpensesData({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireRole(["admin", "super_admin", "union", "accountant"]);
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

  // Server-side date filter keeps payload bounded (this_month ≈ 30 days
  // vs the entire expense history). Composite index
  // bms_expenses_building_date_idx makes this snappy at scale.
  const [{ data: expenses }, { data: bankAccounts }] = await Promise.all([
    supabase
      .from("bms_expenses")
      .select(
        "id, expense_date, category, subcategory, description, vendor, amount, bank_account_id, is_bill",
      )
      .eq("building_id", profile.building_id)
      .eq("is_bill", false)
      .gte("expense_date", dateRange.from)
      .lte("expense_date", dateRange.to)
      .order("expense_date", { ascending: false }),
    supabase
      .from("bms_bank_accounts")
      .select("id, name, type")
      .eq("building_id", profile.building_id)
      .order("type", { ascending: false })
      .order("name"),
  ]);

  return (
    <ExpensesReportClient
      buildingName={buildingName}
      initialDateRange={dateRange}
      rows={(expenses ?? []).map((e) => ({
        id: e.id,
        expense_date: e.expense_date,
        category: e.category,
        subcategory: e.subcategory ?? "",
        description: e.description,
        vendor: e.vendor ?? "",
        amount: Number(e.amount ?? 0),
        bank_account_id: e.bank_account_id ?? null,
      }))}
      bankAccounts={(bankAccounts ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        type: b.type as "cash" | "bank",
      }))}
    />
  );
}
