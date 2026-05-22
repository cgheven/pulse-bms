import { Suspense } from "react";
import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rangeFromSearchParams } from "@/lib/reports/date-range";
import { ReportTabs } from "@/components/admin/reports/report-tabs";
import { ReportSkeleton } from "@/components/admin/reports/report-skeleton";
import { BillsReportClient } from "./bills-report-client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  from?: string;
  to?: string;
  bill_account_id?: string;
  category?: string;
  /** "1" = checkbox on; anything else / absent = off. */
  with_units?: string;
  /** Free-text vendor contains filter (URL-encoded). */
  vendor?: string;
  /** "1" = overdue-only filter on. */
  overdue?: string;
}>;

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
  const billAccountFilter = sp.bill_account_id?.trim() || null;
  // Provider-category filter is applied client-side (the bill_accounts
  // catalogue is ~15 rows so we can join cheaply in memory). Just hand
  // through the URL value so the client can honor it and reflect it in
  // CSV/PDF exports.
  const categoryFilter = sp.category?.trim() || null;
  // with_units + vendor are URL-persisted so a shared bills-report link
  // reproduces the same filtered view (and CSV/PDF reflect the filter).
  // Both are applied client-side because they're cheap in-memory filters.
  const initialWithUnits = sp.with_units === "1";
  const initialVendor = sp.vendor?.trim() || "";
  const initialOverdueOnly = sp.overdue === "1";

  const supabase = await createClient();
  const buildingName = (await getCurrentBuildingName()) ?? "Building";

  // Bills = is_bill=true. Server-side date bound keeps payload small;
  // composite index bms_expenses_building_date_idx handles ordering.
  // Bill-account filter — when passed via URL — is applied server-side
  // so the CSV/PDF export already reflects it.
  let billsQuery = supabase
    .from("bms_expenses")
    .select(
      "id, expense_date, category, subcategory, description, vendor, amount, bank_account_id, bill_account_id, is_bill, recurrence, units_consumed, due_date",
    )
    .eq("building_id", profile.building_id)
    .eq("is_bill", true)
    .gte("expense_date", dateRange.from)
    .lte("expense_date", dateRange.to)
    .order("expense_date", { ascending: false });
  if (billAccountFilter) {
    billsQuery = billsQuery.eq("bill_account_id", billAccountFilter);
  }

  const [{ data: bills }, { data: bankAccounts }, { data: billAccounts }] =
    await Promise.all([
      billsQuery,
      supabase
        .from("bms_bank_accounts")
        .select("id, name, type")
        .eq("building_id", profile.building_id)
        .order("type", { ascending: false })
        .order("name"),
      supabase
        .from("bms_bill_accounts")
        .select("id, nickname, provider, provider_label, is_active")
        .eq("building_id", profile.building_id)
        .order("nickname"),
    ]);

  return (
    <BillsReportClient
      buildingName={buildingName}
      initialDateRange={dateRange}
      initialBillAccountId={billAccountFilter}
      initialCategory={categoryFilter}
      initialWithUnits={initialWithUnits}
      initialVendor={initialVendor}
      initialOverdueOnly={initialOverdueOnly}
      rows={(bills ?? []).map((b) => ({
        id: b.id,
        expense_date: b.expense_date,
        subcategory: b.subcategory ?? "",
        category: b.category,
        description: b.description,
        vendor: b.vendor ?? "",
        amount: Number(b.amount ?? 0),
        bank_account_id: b.bank_account_id ?? null,
        bill_account_id: b.bill_account_id ?? null,
        units_consumed:
          b.units_consumed != null ? Number(b.units_consumed) : null,
        due_date: b.due_date ?? null,
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
      billAccounts={(billAccounts ?? []).map((b) => ({
        id: b.id,
        nickname: b.nickname,
        provider: b.provider,
        provider_label: b.provider_label,
        is_active: !!b.is_active,
      }))}
    />
  );
}
