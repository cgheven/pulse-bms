"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const today = new Date();
  const year = today.getFullYear();
  const ytdStart = `${year}-01-01`;

  // Last 12 months range
  const start12 = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const start12Iso = start12.toISOString().slice(0, 10);
  const currentMonthYm = ymKey(today);

  const { data: building } = await supabase
    .from("bms_buildings")
    .select("fund_balance")
    .eq("id", profile.building_id)
    .single();
  const initialFund = Number(building?.fund_balance ?? 0);

  const { data: payments } = await supabase
    .from("bms_payments")
    .select("amount, payment_date")
    .eq("building_id", profile.building_id)
    .gte("payment_date", start12Iso);

  const { data: expenses } = await supabase
    .from("bms_expenses")
    .select("amount, expense_date, category")
    .eq("building_id", profile.building_id)
    .gte("expense_date", start12Iso);

  // YTD totals (separate query to be sure)
  const { data: paymentsYtd } = await supabase
    .from("bms_payments")
    .select("amount")
    .eq("building_id", profile.building_id)
    .gte("payment_date", ytdStart);

  const { data: expensesYtd } = await supabase
    .from("bms_expenses")
    .select("amount")
    .eq("building_id", profile.building_id)
    .gte("expense_date", ytdStart);

  // All-time totals for fund balance
  const { data: paymentsAll } = await supabase
    .from("bms_payments")
    .select("amount")
    .eq("building_id", profile.building_id);
  const { data: expensesAll } = await supabase
    .from("bms_expenses")
    .select("amount")
    .eq("building_id", profile.building_id);

  const sum = (rows: { amount: number | string | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const income_ytd = sum(paymentsYtd ?? null);
  const expense_ytd = sum(expensesYtd ?? null);
  const net_ytd = income_ytd - expense_ytd;
  const fund_balance = initialFund + sum(paymentsAll ?? null) - sum(expensesAll ?? null);

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
  const monthly: FinanceMonthly[] = Array.from(buckets.values()).map((b) => ({
    ...b,
    net: b.income - b.expense,
  }));

  // Expense breakdown — current month
  const breakdownMap: Map<string, number> = new Map();
  for (const e of expenses ?? []) {
    if (!e.expense_date) continue;
    if (ymKey(e.expense_date) !== currentMonthYm) continue;
    const key = e.category ?? "other";
    breakdownMap.set(key, (breakdownMap.get(key) ?? 0) + Number(e.amount ?? 0));
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
