import { Suspense } from "react";
import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rangeFromSearchParams } from "@/lib/reports/date-range";
import { ReportTabs } from "@/components/admin/reports/report-tabs";
import { ReportSkeleton } from "@/components/admin/reports/report-skeleton";
import { BillsReportClient } from "./bills-report-client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string }>;

// OUTER server component — sync, paints heading + tabs INSTANTLY on tab
// click. Inner async component below fetches data inside Suspense.
export default function BillsReportPage({
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
      <ReportTabs active="bills" />
      <Suspense fallback={<ReportSkeleton />}>
        <BillsData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BillsData({ searchParams }: { searchParams: SearchParams }) {
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

  // Bills = is_bill=true. Server-side date bound keeps payload small;
  // composite index bms_expenses_building_date_idx handles ordering.
  const [{ data: bills }, { data: bankAccounts }] = await Promise.all([
    supabase
      .from("bms_expenses")
      .select(
        "id, expense_date, category, subcategory, description, vendor, amount, bank_account_id, is_bill, recurrence",
      )
      .eq("building_id", profile.building_id)
      .eq("is_bill", true)
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
    <BillsReportClient
      buildingName={buildingName}
      initialDateRange={dateRange}
      rows={(bills ?? []).map((b) => ({
        id: b.id,
        expense_date: b.expense_date,
        subcategory: b.subcategory ?? "",
        category: b.category,
        description: b.description,
        vendor: b.vendor ?? "",
        amount: Number(b.amount ?? 0),
        bank_account_id: b.bank_account_id ?? null,
        recurrence: (b.recurrence ?? null) as
          | "monthly"
          | "quarterly"
          | "yearly"
          | null,
      }))}
      bankAccounts={(bankAccounts ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        type: b.type as "cash" | "bank",
      }))}
    />
  );
}
