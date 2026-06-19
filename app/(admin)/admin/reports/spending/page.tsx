import { Suspense } from "react";
import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { rangeFromSearchParams } from "@/lib/reports/date-range";
import { ReportTabs } from "@/components/admin/reports/report-tabs";
import { ReportSkeleton } from "@/components/admin/reports/report-skeleton";
import { SpendingTypeToggle } from "./spending-type-toggle";
import { ExpensesReportClient } from "@/app/(admin)/admin/reports/expenses/expenses-report-client";
import { BillsReportClient } from "@/app/(admin)/admin/reports/bills/bills-report-client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  from?: string;
  to?: string;
  type?: string;
  bill_account_id?: string;
  category?: string;
  with_units?: string;
  vendor?: string;
  overdue?: string;
}>;

export default function SpendingPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="space-y-1">
        <h1>Reports</h1>
        <p className="text-muted-foreground text-sm">
          All outgoing spend — operating expenses and utility bills.
        </p>
      </div>
      <ReportTabs active="spending" />
      <Suspense fallback={<ReportSkeleton />}>
        <SpendingData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SpendingData({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(["admin", "super_admin", "union"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const sp = await searchParams;
  const activeType: "expenses" | "bills" = sp.type === "bills" ? "bills" : "expenses";
  const dateRange = rangeFromSearchParams(sp);
  const supabase = await createClient();
  const buildingName = (await getCurrentBuildingName()) ?? "Building";

  if (activeType === "bills") {
    const billAccountFilter = sp.bill_account_id?.trim() || null;
    const categoryFilter = sp.category?.trim() || null;
    const initialWithUnits = sp.with_units === "1";
    const initialVendor = sp.vendor?.trim() || "";
    const initialOverdueOnly = sp.overdue === "1";

    let billsQuery = supabase
      .from("bms_expenses")
      .select(
        "id, expense_date, category, subcategory, description, vendor, amount, bank_account_id, bill_account_id, is_bill, recurrence, units_consumed, due_date",
      )
      .eq("building_id", buildingId)
      .eq("is_bill", true)
      .gte("expense_date", dateRange.from)
      .lte("expense_date", dateRange.to)
      .order("expense_date", { ascending: false });
    if (billAccountFilter) {
      billsQuery = billsQuery.eq("bill_account_id", billAccountFilter);
    }

    const [
      { data: bills },
      { data: bankAccounts },
      { data: billAccounts },
      { data: buildingRow },
      { data: paymentsPrePeriod },
      { data: expensesPrePeriod },
      { data: salariesPrePeriod },
    ] = await Promise.all([
      billsQuery,
      supabase.from("bms_bank_accounts").select("id, name, type").eq("building_id", buildingId).order("type", { ascending: false }).order("name"),
      supabase.from("bms_bill_accounts").select("id, nickname, provider, provider_label, is_active").eq("building_id", buildingId).order("nickname"),
      supabase.from("bms_buildings").select("fund_balance").eq("id", buildingId).single(),
      supabase.from("bms_payments").select("amount").eq("building_id", buildingId).lt("payment_date", dateRange.from),
      supabase.from("bms_expenses").select("amount").eq("building_id", buildingId).lt("expense_date", dateRange.from),
      supabase.from("bms_salary_payments").select("amount").eq("building_id", buildingId).lt("payment_date", dateRange.from),
    ]);

    const sumRows = (rows: { amount: number | string | null }[] | null) =>
      (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

    const openingBalance =
      Number(buildingRow?.fund_balance ?? 0) +
      sumRows(paymentsPrePeriod) -
      sumRows(expensesPrePeriod) -
      sumRows(salariesPrePeriod);

    return (
      <div className="space-y-5">
        <SpendingTypeToggle active="bills" />
        <BillsReportClient
          buildingName={buildingName}
          initialDateRange={dateRange}
          openingBalance={openingBalance}
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
            units_consumed: b.units_consumed != null ? Number(b.units_consumed) : null,
            due_date: b.due_date ?? null,
            recurrence: (b.recurrence ?? null) as "monthly" | "quarterly" | "yearly" | null,
          }))}
          bankAccounts={(bankAccounts ?? []).map((b) => ({ id: b.id, name: b.name, type: b.type as "cash" | "bank" }))}
          billAccounts={(billAccounts ?? []).map((b) => ({
            id: b.id,
            nickname: b.nickname,
            provider: b.provider,
            provider_label: b.provider_label,
            is_active: !!b.is_active,
          }))}
        />
      </div>
    );
  }

  // Default: expenses
  const [{ data: expenses }, { data: bankAccounts }] = await Promise.all([
    supabase
      .from("bms_expenses")
      .select("id, expense_date, category, subcategory, description, vendor, amount, bank_account_id, is_bill")
      .eq("building_id", buildingId)
      .eq("is_bill", false)
      .gte("expense_date", dateRange.from)
      .lte("expense_date", dateRange.to)
      .order("expense_date", { ascending: false }),
    supabase.from("bms_bank_accounts").select("id, name, type").eq("building_id", buildingId).order("type", { ascending: false }).order("name"),
  ]);

  return (
    <div className="space-y-5">
      <SpendingTypeToggle active="expenses" />
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
        bankAccounts={(bankAccounts ?? []).map((b) => ({ id: b.id, name: b.name, type: b.type as "cash" | "bank" }))}
      />
    </div>
  );
}
