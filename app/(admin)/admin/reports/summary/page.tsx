import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { ReportTabs } from "@/components/admin/reports/report-tabs";
import { ReportSkeleton } from "@/components/admin/reports/report-skeleton";
import { formatCurrency } from "@/lib/utils";
import { MonthlyReportButton } from "./monthly-report-button";

export const dynamic = "force-dynamic";

export default function SummaryPage() {
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1>Reports</h1>
          <p className="text-muted-foreground text-sm">
            Financial overview — collections, spending and fund health at a glance.
          </p>
        </div>
        <MonthlyReportButton />
      </div>
      <ReportTabs active="summary" />
      <Suspense fallback={<ReportSkeleton />}>
        <SummaryData />
      </Suspense>
    </div>
  );
}

async function SummaryData() {
  await requireRole(["admin", "super_admin", "union"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  // Current month in PK timezone (UTC+5, no DST)
  const pkNow = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const y = pkNow.getUTCFullYear();
  const mo = pkNow.getUTCMonth();
  const from = `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  const to = new Date(Date.UTC(y, mo + 1, 0)).toISOString().slice(0, 10);
  const monthLabel = new Date(Date.UTC(y, mo, 15)).toLocaleDateString("en-PK", {
    month: "long",
    year: "numeric",
  });

  const supabase = await createClient();

  const [
    { data: buildingRow },
    { data: payMonth },
    { data: expMonth },
    { data: billMonth },
    { data: salMonth },
    { data: payAll },
    { data: expAll },
    { data: salAll },
    { data: flatsOwing },
    { data: levyCharges },
  ] = await Promise.all([
    supabase.from("bms_buildings").select("fund_balance").eq("id", buildingId).single(),
    supabase.from("bms_payments").select("amount").eq("building_id", buildingId).gte("payment_date", from).lte("payment_date", to),
    supabase.from("bms_expenses").select("amount").eq("building_id", buildingId).eq("is_bill", false).gte("expense_date", from).lte("expense_date", to),
    supabase.from("bms_expenses").select("amount").eq("building_id", buildingId).eq("is_bill", true).gte("expense_date", from).lte("expense_date", to),
    supabase.from("bms_salary_payments").select("amount").eq("building_id", buildingId).gte("payment_date", from).lte("payment_date", to),
    supabase.from("bms_payments").select("amount").eq("building_id", buildingId),
    supabase.from("bms_expenses").select("amount").eq("building_id", buildingId),
    supabase.from("bms_salary_payments").select("amount").eq("building_id", buildingId),
    supabase.from("bms_flats").select("outstanding_dues").eq("building_id", buildingId).gt("outstanding_dues", 0),
    supabase.from("bms_levy_charges").select("amount").eq("building_id", buildingId).eq("status", "pending"),
  ]);

  const sumAmt = (rows: { amount?: number | string | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const collected = sumAmt(payMonth);
  const expensesAmt = sumAmt(expMonth);
  const billsAmt = sumAmt(billMonth);
  const salariesAmt = sumAmt(salMonth);
  const totalSpent = expensesAmt + billsAmt + salariesAmt;
  const net = collected - totalSpent;

  const fundBalance =
    Number(buildingRow?.fund_balance ?? 0) +
    sumAmt(payAll) -
    sumAmt(expAll) -
    sumAmt(salAll);

  const pendingMaint = (flatsOwing ?? []).reduce(
    (s, f) => s + Number((f as { outstanding_dues?: number | string }).outstanding_dues ?? 0),
    0,
  );
  const pendingLevy = sumAmt(levyCharges);
  const pendingTotal = pendingMaint + pendingLevy;
  const pendingFlatCount = (flatsOwing ?? []).length;
  const payCount = (payMonth ?? []).length;
  const billCount = (billMonth ?? []).length;

  const spendingBreakdown = [
    { label: "Utility Bills", value: billsAmt },
    { label: "Operating Expenses", value: expensesAmt },
    { label: "Staff Salaries", value: salariesAmt },
  ].filter((x) => x.value > 0);

  return (
    <div className="space-y-4">
      {/* Period header */}
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">{monthLabel}</span>
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card-soft py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Collected
          </p>
          <p className="text-2xl font-bold mt-2 tabular-nums">{formatCurrency(collected)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {payCount} payment{payCount !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="card-soft py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Expenses
          </p>
          <p className="text-2xl font-bold mt-2 tabular-nums">
            {formatCurrency(expensesAmt + salariesAmt)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Operations &amp; staff</p>
        </div>

        <div className="card-soft py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Utility Bills
          </p>
          <p className="text-2xl font-bold mt-2 tabular-nums">{formatCurrency(billsAmt)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {billCount} bill{billCount !== 1 ? "s" : ""} paid
          </p>
        </div>

        <div
          className="card-soft py-5"
          style={{ borderLeft: "3px solid hsl(var(--primary))" }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Fund Balance
          </p>
          <p className="text-2xl font-bold mt-2 tabular-nums text-primary">
            {formatCurrency(fundBalance)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Total available</p>
        </div>
      </div>

      {/* Net this month */}
      <div className="card-soft flex items-center justify-between py-4 px-5">
        <div>
          <p className="text-sm font-semibold">Net this month</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Collected − all spending
          </p>
        </div>
        <p
          className={`text-2xl font-bold tabular-nums ${
            net >= 0 ? "text-foreground" : "text-destructive"
          }`}
        >
          {net >= 0 ? "+" : ""}
          {formatCurrency(net)}
        </p>
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Pending */}
        <div className="card-soft py-5 flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pending Payments
          </p>
          {pendingTotal > 0 ? (
            <>
              <p className="text-2xl font-bold mt-2 tabular-nums text-destructive">
                {formatCurrency(pendingTotal)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {pendingFlatCount} flat{pendingFlatCount !== 1 ? "s" : ""} with maintenance due
                {pendingLevy > 0 && (
                  <> · {formatCurrency(pendingLevy)} levy charges</>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold mt-2">{formatCurrency(0)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                All maintenance collected ✓
              </p>
            </>
          )}
          <Link
            href="/admin/billing"
            className="inline-flex items-center gap-1 text-xs text-primary mt-4 hover:underline"
          >
            View billing <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Spending breakdown */}
        <div className="card-soft py-5 flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Spending Breakdown
          </p>
          {spendingBreakdown.length > 0 ? (
            <div className="mt-3 space-y-2 flex-1">
              {spendingBreakdown.map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(value)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
                <span className="font-semibold">Total spent</span>
                <span className="font-bold tabular-nums">{formatCurrency(totalSpent)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-3 flex-1">
              No spending recorded this month.
            </p>
          )}
          <Link
            href="/admin/reports/spending"
            className="inline-flex items-center gap-1 text-xs text-primary mt-4 hover:underline"
          >
            View spending <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
