import { Suspense } from "react";
import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rangeFromSearchParams } from "@/lib/reports/date-range";
import { ReportTabs } from "@/components/admin/reports/report-tabs";
import { ReportSkeleton } from "@/components/admin/reports/report-skeleton";
import { DayBookClient } from "./day-book-client";
import { formatReceiptNo } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string }>;

// OUTER server component — sync, paints heading + tabs INSTANTLY on tab
// click. Inner async component below fetches data inside Suspense.
export default function DayBookPage({
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
      <ReportTabs active="day-book" />
      <Suspense fallback={<ReportSkeleton />}>
        <DayBookData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DayBookData({ searchParams }: { searchParams: SearchParams }) {
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

  // Day Book is per-transaction narrative — but opening balance on the
  // first visible day needs ALL movements BEFORE dateRange.from. So we
  // fetch up to `to` only (lte) — admin can't see future-dated rows
  // they haven't entered yet — and let the client roll the running
  // balance forward day-by-day with the same O(N + D) memoized math
  // Cash Book uses.
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
      .select(
        `id, payment_date, amount, payment_mode, category, receipt_no,
         bank_account_id, notes,
         bms_flats(flat_number),
         bms_residents(full_name)`,
      )
      .eq("building_id", profile.building_id)
      .lte("payment_date", dateRange.to)
      .order("payment_date", { ascending: true }),
    supabase
      .from("bms_expenses")
      .select(
        "id, expense_date, category, subcategory, description, vendor, amount, bank_account_id",
      )
      .eq("building_id", profile.building_id)
      .lte("expense_date", dateRange.to)
      .order("expense_date", { ascending: true }),
    supabase
      .from("bms_salary_payments")
      .select(
        `id, payment_date, amount, payment_mode, slip_no, notes,
         bank_account_id, staff_id,
         bms_staff(full_name)`,
      )
      .eq("building_id", profile.building_id)
      .lte("payment_date", dateRange.to)
      .order("payment_date", { ascending: true }),
  ]);

  type RawPayment = {
    id: string;
    payment_date: string;
    amount: number | string;
    payment_mode: string;
    category: string;
    receipt_no: number | null;
    bank_account_id: string | null;
    notes: string | null;
    bms_flats: { flat_number: string } | { flat_number: string }[] | null;
    bms_residents:
      | { full_name: string }
      | { full_name: string }[]
      | null;
  };

  type RawSalary = {
    id: string;
    payment_date: string;
    amount: number | string;
    payment_mode: string;
    slip_no: string | null;
    notes: string | null;
    bank_account_id: string | null;
    staff_id: string;
    bms_staff: { full_name: string } | { full_name: string }[] | null;
  };

  const paymentRows = (payments ?? []).map((p) => {
    const r = p as unknown as RawPayment;
    const flat = Array.isArray(r.bms_flats) ? r.bms_flats[0] : r.bms_flats;
    const resident = Array.isArray(r.bms_residents)
      ? r.bms_residents[0]
      : r.bms_residents;
    // Notes can encode a transfer fee even when the DB enum doesn't —
    // mirror what Income Register does so categories stay consistent.
    const category = /transfer/i.test(r.notes ?? "")
      ? "transfer_fee"
      : r.category;
    return {
      id: r.id,
      date: r.payment_date,
      amount: Number(r.amount ?? 0),
      payment_mode: r.payment_mode,
      category,
      receipt_no: formatReceiptNo(r.receipt_no),
      bank_account_id: r.bank_account_id,
      flat_number: flat?.flat_number ?? "—",
      resident_name: resident?.full_name ?? "—",
      notes: r.notes ?? "",
    };
  });

  const expenseRows = (expenses ?? []).map((e) => ({
    id: e.id,
    date: e.expense_date,
    amount: Number(e.amount ?? 0),
    category: e.category as string,
    subcategory: e.subcategory ?? "",
    description: e.description ?? "",
    vendor: e.vendor ?? "",
    bank_account_id: e.bank_account_id ?? null,
  }));

  const salaryRows = (salaryPayments ?? []).map((s) => {
    const r = s as unknown as RawSalary;
    const staff = Array.isArray(r.bms_staff) ? r.bms_staff[0] : r.bms_staff;
    return {
      id: r.id,
      date: r.payment_date,
      amount: Number(r.amount ?? 0),
      payment_mode: r.payment_mode,
      slip_no: r.slip_no ?? "",
      bank_account_id: r.bank_account_id,
      staff_name: staff?.full_name ?? "Staff",
      notes: r.notes ?? "",
    };
  });

  return (
    <DayBookClient
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
      payments={paymentRows}
      expenses={expenseRows}
      salaries={salaryRows}
    />
  );
}
