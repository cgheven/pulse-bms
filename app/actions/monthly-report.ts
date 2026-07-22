"use server";

import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { formatReceiptNo, formatDate } from "@/lib/utils";

export type SectionKey = "collections" | "expenses" | "bills" | "salaries" | "projects";

export type MonthlyReportData = {
  buildingName: string;
  from: string;
  to: string;
  fundBalance: number;
  totals: {
    collected: number;
    expenses: number;
    bills: number;
    salaries: number;
    net: number;
  };
  collections: Array<{
    date: string;
    flat: string;
    resident: string;
    category: string;
    amount: number;
    mode: string;
    receipt: string;
  }> | null;
  expenses: Array<{
    date: string;
    category: string;
    description: string;
    vendor: string;
    amount: number;
  }> | null;
  bills: Array<{
    date: string;
    billType: string;
    vendor: string;
    amount: number;
    units: string;
  }> | null;
  salaries: Array<{
    date: string;
    staffName: string;
    staffRole: string;
    amount: number;
  }> | null;
  projects: Array<{
    date: string;
    projectName: string;
    amount: number;
    mode: string;
  }> | null;
};

const STAFF_ROLE_LABELS: Record<string, string> = {
  chowkidar:      "Chowkidar (Guard)",
  sweeper:        "Sweeper",
  lift_man:       "Lift Operator",
  generator_tech: "Generator Technician",
  plumber:        "Plumber",
  electrician:    "Electrician",
  other:          "Other",
};

const CATEGORY_LABELS: Record<string, string> = {
  maintenance: "Maintenance",
  entry_fee: "Entry Fee",
  transfer_fee: "Transfer Fee",
  fine: "Fine",
  project: "Project Fund",
  other: "Other",
  credit_carryforward: "Credit carry-forward",
};

const MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  online: "Online",
  cheque: "Cheque",
  credit_carryforward: "Credit",
};

function billTypeLabel(sub: string): string {
  const MAP: Record<string, string> = {
    corridor_electricity: "K-Electric",
    electricity_corridor: "K-Electric",
    gas: "SSGC Gas",
    water_supply: "Water Supply",
    water_motor: "Water Motor",
    internet: "Internet",
    lift_service: "Lift AMC",
    generator_diesel: "Generator Diesel",
    generator_oil: "Generator Oil",
  };
  return (
    MAP[sub] ??
    (sub || "—")
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ")
  );
}

export async function getMonthlyReportData(input: {
  from: string;
  to: string;
  sections: SectionKey[];
}): Promise<{ data: MonthlyReportData | null; error: string | null }> {
  try {
    await requireRole(["admin", "super_admin", "union"]);
    const buildingId = await getActiveBuilding();
    if (!buildingId) return { data: null, error: "No building assigned." };

    const buildingName = (await getCurrentBuildingName()) ?? "Building";
    const supabase = await createClient();
    const { from, to, sections } = input;

    const none = Promise.resolve({ data: null, error: null });

    const [
      { data: building },
      { data: payAll },
      { data: expAll },
      { data: salAll },
      { data: payPeriod },
      { data: expPeriod },
      { data: billPeriod },
      { data: salPeriod },
      { data: collectionsRaw },
      { data: expensesRaw },
      { data: billsRaw },
      { data: salariesRaw },
      { data: projectsRaw },
      { data: projectsLookup },
    ] = await Promise.all([
      supabase.from("bms_buildings").select("fund_balance").eq("id", buildingId).single(),
      // All-time totals for fund balance
      supabase.from("bms_payments").select("amount.sum()").eq("building_id", buildingId),
      supabase.from("bms_expenses").select("amount.sum()").eq("building_id", buildingId),
      supabase.from("bms_salary_payments").select("amount.sum()").eq("building_id", buildingId),
      // Period totals for KPI summary
      supabase.from("bms_payments").select("amount.sum()").eq("building_id", buildingId).gte("payment_date", from).lte("payment_date", to),
      supabase.from("bms_expenses").select("amount.sum()").eq("building_id", buildingId).eq("is_bill", false).gte("expense_date", from).lte("expense_date", to),
      supabase.from("bms_expenses").select("amount.sum()").eq("building_id", buildingId).eq("is_bill", true).gte("expense_date", from).lte("expense_date", to),
      supabase.from("bms_salary_payments").select("amount.sum()").eq("building_id", buildingId).gte("payment_date", from).lte("payment_date", to),
      // Section rows — only fetched when selected
      sections.includes("collections")
        ? supabase.from("bms_payments").select(`id, payment_date, amount, payment_mode, category, receipt_no, notes, bms_flats!inner(flat_number), bms_residents(full_name)`).eq("building_id", buildingId).gte("payment_date", from).lte("payment_date", to).order("payment_date", { ascending: false })
        : none,
      sections.includes("expenses")
        ? supabase.from("bms_expenses").select("id, expense_date, amount, category, description, vendor").eq("building_id", buildingId).eq("is_bill", false).gte("expense_date", from).lte("expense_date", to).order("expense_date", { ascending: false })
        : none,
      sections.includes("bills")
        ? supabase.from("bms_expenses").select("id, expense_date, amount, subcategory, vendor, units_consumed").eq("building_id", buildingId).eq("is_bill", true).gte("expense_date", from).lte("expense_date", to).order("expense_date", { ascending: false })
        : none,
      sections.includes("salaries")
        ? supabase.from("bms_salary_payments").select("id, payment_date, amount, bms_staff(full_name, role)").eq("building_id", buildingId).gte("payment_date", from).lte("payment_date", to).order("payment_date", { ascending: false })
        : none,
      sections.includes("projects")
        ? supabase.from("bms_payments").select("id, payment_date, amount, payment_mode, project_id").eq("building_id", buildingId).eq("category", "project").not("project_id", "is", null).gte("payment_date", from).lte("payment_date", to).order("payment_date", { ascending: false })
        : none,
      sections.includes("projects")
        ? supabase.from("bms_projects").select("id, name").eq("building_id", buildingId)
        : none,
    ]);

    const fundBalance =
      Number(building?.fund_balance ?? 0) +
      Number((payAll as { sum: string | null }[] | null)?.[0]?.sum ?? 0) -
      Number((expAll as { sum: string | null }[] | null)?.[0]?.sum ?? 0) -
      Number((salAll as { sum: string | null }[] | null)?.[0]?.sum ?? 0);

    const collected = Number((payPeriod  as { sum: string | null }[] | null)?.[0]?.sum ?? 0);
    const expenses  = Number((expPeriod  as { sum: string | null }[] | null)?.[0]?.sum ?? 0);
    const bills     = Number((billPeriod as { sum: string | null }[] | null)?.[0]?.sum ?? 0);
    const salaries  = Number((salPeriod  as { sum: string | null }[] | null)?.[0]?.sum ?? 0);
    const net       = collected - expenses - bills - salaries;

    // Build collections rows
    type RawPayment = {
      id: string;
      payment_date: string;
      amount: number | string;
      payment_mode: string;
      category: string;
      receipt_no: number | null;
      notes: string | null;
      bms_flats: { flat_number: string } | { flat_number: string }[] | null;
      bms_residents: { full_name: string } | { full_name: string }[] | null;
    };

    const collectionRows = collectionsRaw
      ? (collectionsRaw as unknown as RawPayment[]).map((r) => {
          const flat = Array.isArray(r.bms_flats) ? r.bms_flats[0] : r.bms_flats;
          const res  = Array.isArray(r.bms_residents) ? r.bms_residents[0] : r.bms_residents;
          const cat  = /transfer/i.test(r.notes ?? "") ? "transfer_fee" : r.category;
          return {
            date:     formatDate(r.payment_date),
            flat:     flat?.flat_number ?? "—",
            resident: res?.full_name ?? "—",
            category: CATEGORY_LABELS[cat] ?? cat,
            amount:   Number(r.amount ?? 0),
            mode:     MODE_LABELS[r.payment_mode] ?? r.payment_mode,
            receipt:  formatReceiptNo(r.receipt_no),
          };
        })
      : null;

    // Build expenses rows
    const expenseRows = expensesRaw
      ? (expensesRaw as { id: string; expense_date: string; amount: number | string; category: string; description: string; vendor: string | null }[]).map((r) => ({
          date:        formatDate(r.expense_date),
          category:    r.category,
          description: r.description,
          vendor:      r.vendor || "—",
          amount:      Number(r.amount ?? 0),
        }))
      : null;

    // Build bills rows
    const billRows = billsRaw
      ? (billsRaw as { id: string; expense_date: string; amount: number | string; subcategory: string | null; vendor: string | null; units_consumed: number | null }[]).map((r) => ({
          date:     formatDate(r.expense_date),
          billType: billTypeLabel(r.subcategory ?? ""),
          vendor:   r.vendor || "—",
          amount:   Number(r.amount ?? 0),
          units:    r.units_consumed != null ? String(r.units_consumed) : "—",
        }))
      : null;

    // Build salaries rows
    type RawSalary = {
      id: string;
      payment_date: string;
      amount: number | string;
      bms_staff: { full_name: string; role: string } | { full_name: string; role: string }[] | null;
    };

    const salaryRows = salariesRaw
      ? (salariesRaw as unknown as RawSalary[]).map((r) => {
          const staff = Array.isArray(r.bms_staff) ? r.bms_staff[0] : r.bms_staff;
          return {
            date:      formatDate(r.payment_date),
            staffName: staff?.full_name ?? "Staff",
            staffRole: STAFF_ROLE_LABELS[staff?.role ?? ""] ?? (staff?.role ?? "—"),
            amount:    Number(r.amount ?? 0),
          };
        })
      : null;

    // Build project rows
    const projMap = new Map(
      (projectsLookup as { id: string; name: string }[] | null ?? []).map((p) => [p.id, p.name]),
    );
    const projectRows = projectsRaw
      ? (projectsRaw as { id: string; payment_date: string; amount: number | string; payment_mode: string; project_id: string | null }[]).map((r) => ({
          date:        formatDate(r.payment_date),
          projectName: r.project_id ? (projMap.get(r.project_id) ?? "Unknown project") : "—",
          amount:      Number(r.amount ?? 0),
          mode:        MODE_LABELS[r.payment_mode] ?? r.payment_mode,
        }))
      : null;

    const data: MonthlyReportData = {
      buildingName,
      from,
      to,
      fundBalance,
      totals: { collected, expenses, bills, salaries, net },
      collections: collectionRows,
      expenses:    expenseRows,
      bills:       billRows,
      salaries:    salaryRows,
      projects:    projectRows,
    };

    return { data, error: null };
  } catch (err) {
    console.error("getMonthlyReportData", err);
    return { data: null, error: "Failed to load report data. Please try again." };
  }
}
