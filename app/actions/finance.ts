"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { getCashTotals } from "@/lib/finance-totals";

export type FinanceMonthly = {
  month: string; // YYYY-MM
  income: number;
  expense: number;
  net: number;
};

export type FinanceSummary = {
  income_ytd: number;
  expense_ytd: number;
  net_ytd: number;
  fund_balance: number;
  monthly: FinanceMonthly[];
  expense_breakdown: { category: string; amount: number }[];
};

function ymKey(d: string | Date) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

export async function getFinanceSummary(): Promise<FinanceSummary> {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const today = new Date();
  const year = today.getFullYear();
  const ytdStart = `${year}-01-01`;

  // Last 12 months range
  const start12 = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const start12Iso = start12.toISOString().slice(0, 10);
  const currentMonthYm = ymKey(today);

  // 10 parallel queries: building opening + 3 streams × (12mo, YTD, all-time).
  // Salaries live in bms_salary_payments (separate from bms_expenses) — including all 3
  // outflow streams here. Earlier impl omitted salaries → fund_balance overstated.
  const [
    { data: building },
    { data: payments },
    { data: expenses },
    { data: salaries },
    ytd,
    lifetime,
  ] = await Promise.all([
    supabase
      .from("bms_buildings")
      .select("fund_balance")
      .eq("id", buildingId)
      .single(),
    supabase
      .from("bms_payments")
      .select("amount, payment_date")
      .eq("building_id", buildingId)
      .gte("payment_date", start12Iso)
      .limit(5000),
    supabase
      .from("bms_expenses")
      .select("amount, expense_date, category")
      .eq("building_id", buildingId)
      .gte("expense_date", start12Iso)
      .limit(5000),
    supabase
      .from("bms_salary_payments")
      .select("amount, payment_date")
      .eq("building_id", buildingId)
      .gte("payment_date", start12Iso)
      .limit(5000),
    // PostgREST aggregates are disabled on this project, so both of these go
    // through the RPC (paged fallback if it isn't deployed yet).
    getCashTotals(supabase, buildingId, { from: ytdStart }),
    getCashTotals(supabase, buildingId),
  ]);
  const initialFund = Number(building?.fund_balance ?? 0);

  const sum = (rows: { amount: number | string | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const income_ytd = ytd.payments;
  const expense_ytd = ytd.expenses + ytd.salaries;
  const net_ytd = income_ytd - expense_ytd;
  const fund_balance =
    initialFund + lifetime.payments - lifetime.expenses - lifetime.salaries;

  // Build 12-month buckets
  const buckets: Map<string, FinanceMonthly> = new Map();
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - (11 - i), 1);
    const key = ymKey(d);
    buckets.set(key, { month: key, income: 0, expense: 0, net: 0 });
  }
  for (const p of payments ?? []) {
    if (!p.payment_date) continue;
    const k = ymKey(p.payment_date);
    const b = buckets.get(k);
    if (b) b.income += Number(p.amount ?? 0);
  }
  for (const e of expenses ?? []) {
    if (!e.expense_date) continue;
    const k = ymKey(e.expense_date);
    const b = buckets.get(k);
    if (b) b.expense += Number(e.amount ?? 0);
  }
  for (const s of salaries ?? []) {
    if (!s.payment_date) continue;
    const k = ymKey(s.payment_date);
    const b = buckets.get(k);
    if (b) b.expense += Number(s.amount ?? 0);
  }
  const monthly: FinanceMonthly[] = Array.from(buckets.values()).map((b) => ({
    ...b,
    net: b.income - b.expense,
  }));

  // Expense breakdown — current month. Salary surfaces as its own slice so the
  // donut shows where money actually went.
  const breakdownMap: Map<string, number> = new Map();
  for (const e of expenses ?? []) {
    if (!e.expense_date) continue;
    if (ymKey(e.expense_date) !== currentMonthYm) continue;
    const key = e.category ?? "other";
    breakdownMap.set(key, (breakdownMap.get(key) ?? 0) + Number(e.amount ?? 0));
  }
  let salaryCurrentMonth = 0;
  for (const s of salaries ?? []) {
    if (!s.payment_date) continue;
    if (ymKey(s.payment_date) !== currentMonthYm) continue;
    salaryCurrentMonth += Number(s.amount ?? 0);
  }
  if (salaryCurrentMonth > 0) {
    breakdownMap.set("salaries", (breakdownMap.get("salaries") ?? 0) + salaryCurrentMonth);
  }
  const expense_breakdown = Array.from(breakdownMap.entries()).map(([category, amount]) => ({
    category,
    amount,
  }));

  return {
    income_ytd,
    expense_ytd,
    net_ytd,
    fund_balance,
    monthly,
    expense_breakdown,
  };
}
