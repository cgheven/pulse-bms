import Link from "next/link";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { createClient } from "@/lib/supabase/server";
import {
  cn,
  formatCurrency,
  formatLakh,
  formatMonthLabel,
} from "@/lib/utils";
import { StatCard } from "@/components/ui/stat-card";
import { getCashTotals, cashBalanceFrom } from "@/lib/finance-totals";
import { getSetupStatus } from "@/app/actions/setup";
import { SetupBannerCard } from "@/components/admin/setup/setup-banner-card";
import {
  RevenueExpensesChart,
  type RevExpPoint,
} from "@/components/admin/dashboard/revenue-expenses-chart";
import {
  CheckCircle2,
  CreditCard,
  MessageSquareWarning,
  Scale,
  ShieldAlert,
  TrendingDown,
  UserCog,
  Wallet,
  Zap,
} from "lucide-react";

export const dynamic = "force-dynamic";


/** First day of a month, N months offset from "YYYY-MM", as YYYY-MM-DD. */
function monthStartIso(ym: string, offset = 0): string {
  const [y, m] = ym.split("-").map(Number);
  // Date.UTC keeps this independent of the server's timezone — building the
  // date with `new Date(y, m, 1)` then calling toISOString() shifts a day
  // backwards on any server east of UTC (e.g. a machine set to PKT).
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 10);
}

/** Six consecutive month buckets starting at `startIso` (a YYYY-MM-DD first of
 *  month), each with its "YYYY-MM" key and short label (Jun, Jul, …). */
function sixMonthBuckets(startIso: string): { ym: string; label: string }[] {
  const [y, m] = startIso.split("-").map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return {
      ym: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    };
  });
}

export default async function AdminDashboardPage() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) {
    return (
      <div className="card-soft">
        <h1>Admin Dashboard</h1>
        <p className="text-muted-foreground mt-2">No building assigned to your account.</p>
      </div>
    );
  }
  // Use PKT (UTC+5) for month boundaries so the dashboard shows the correct
  // month during the first 5 hours of each calendar day in Pakistan.
  const pkNow = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const todayIso = pkNow.toISOString().slice(0, 10);
  const currentYm = todayIso.slice(0, 7);

  // The dashboard always shows the live current month.
  const ym = currentYm;

  const monthStart = monthStartIso(ym);
  const nextMonthStart = monthStartIso(ym, 1);
  // Inclusive last day of the month — the as-of point for cash held.
  const monthEnd = new Date(new Date(`${nextMonthStart}T00:00:00Z`).getTime() - 86400_000)
    .toISOString()
    .slice(0, 10);
  const prevMonthStart = monthStartIso(ym, -1);
  const sixMonthsAgo = monthStartIso(ym, -5);

  const monthLabel = formatMonthLabel(ym);

  return (
    <div className="space-y-4 animate-fade-up max-w-6xl">
      <header>
        <h1>Dashboard</h1>
        <p className="text-muted-foreground mt-1">{monthLabel} overview</p>
      </header>

      {/* Streams in its own boundary so the setup check never blocks the
          financial cards; renders nothing once setup is complete. */}
      <Suspense fallback={null}>
        <SetupBanner />
      </Suspense>

      {/* All 8 KPI tiles share one 4-column grid so they sit as two even rows
          of four, while each group still streams in its own Suspense boundary. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        <Suspense fallback={<CardSkeletons count={6} heroFirst />}>
          <FinancialCards
            buildingId={buildingId}
            monthStart={monthStart}
            nextMonthStart={nextMonthStart}
            monthEnd={monthEnd}
            prevMonthStart={prevMonthStart}
            sixMonthsAgo={sixMonthsAgo}
            monthLabel={monthLabel}
            isCurrentMonth
          />
        </Suspense>
        <Suspense fallback={<CardSkeletons count={2} />}>
          <StatusTiles
            buildingId={buildingId}
            monthStart={monthStart}
            prevMonthStart={prevMonthStart}
            todayIso={todayIso}
          />
        </Suspense>
      </div>

      <Suspense fallback={<DashboardInsightsSkeleton />}>
        <DashboardInsights
          buildingId={buildingId}
          monthStart={monthStart}
          sixMonthsAgo={sixMonthsAgo}
        />
      </Suspense>
    </div>
  );
}

/* ═══════════════  Quick Setup banner  ═══════════════ */

// Shown until every required setup step is done. Streamed in its own Suspense
// boundary so the status counts never delay the financial cards.
async function SetupBanner() {
  const status = await getSetupStatus();
  if (status.setupComplete) return null;
  return (
    <SetupBannerCard
      requiredDone={status.requiredDone}
      requiredTotal={status.requiredTotal}
    />
  );
}

/* ═══════════════  2. Financial cards · 2×2 grid  ═══════════════ */

async function FinancialCards({
  buildingId,
  monthStart,
  nextMonthStart,
  monthEnd,
  prevMonthStart,
  sixMonthsAgo,
  monthLabel,
  isCurrentMonth,
}: {
  buildingId: string;
  monthStart: string;
  nextMonthStart: string;
  monthEnd: string;
  prevMonthStart: string;
  sixMonthsAgo: string;
  monthLabel: string;
  isCurrentMonth: boolean;
}) {
  const supabase = await createClient();

  // 11 parallel queries: lifetime sums (for Cash) + this-month + prev-month flows
  // + this-month + prev-month invoices (for Collection rate + trend).
  const [
    { data: building },
    { data: monthPayments },
    { data: monthExpenses },
    { data: monthSalaries },
    { data: prevExpenses },
    { data: prevSalaries },
    cashTotals,
    { data: monthInvoices },
    { data: prevInvoices },
  ] = await Promise.all([
    supabase
      .from("bms_buildings")
      .select("fund_balance, opening_balance_date")
      .eq("id", buildingId)
      .single(),
    supabase
      .from("bms_payments")
      .select("amount")
      .eq("building_id", buildingId)
      .gte("payment_date", monthStart)
      .lt("payment_date", nextMonthStart),
    supabase
      .from("bms_expenses")
      .select("amount, is_bill")
      .eq("building_id", buildingId)
      .gte("expense_date", monthStart)
      .lt("expense_date", nextMonthStart),
    supabase
      .from("bms_salary_payments")
      .select("amount")
      .eq("building_id", buildingId)
      .gte("payment_date", monthStart)
      .lt("payment_date", nextMonthStart),
    supabase
      .from("bms_expenses")
      .select("amount")
      .eq("building_id", buildingId)
      .gte("expense_date", prevMonthStart)
      .lt("expense_date", monthStart),
    supabase
      .from("bms_salary_payments")
      .select("amount")
      .eq("building_id", buildingId)
      .gte("payment_date", prevMonthStart)
      .lt("payment_date", monthStart),
    // Cumulative up to the END of the selected month, so switching to a past
    // month shows the closing balance actually held then — not today's. On the
    // current month this window covers everything, so the figure is unchanged.
    getCashTotals(supabase, buildingId, { to: monthEnd }),
    supabase
      .from("bms_invoices")
      .select("id, amount, status, flat_id, bms_flats(flat_number)")
      .eq("building_id", buildingId)
      .eq("billing_month", monthStart),
    supabase
      .from("bms_invoices")
      .select("id, amount, status")
      .eq("building_id", buildingId)
      .eq("billing_month", prevMonthStart),
  ]);
  void sixMonthsAgo;

  const sum = (rows: { amount: number | string | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  // This-month flow. Expenses split into utility bills (is_bill) and general
  // operations so each gets its own tile; `expenses` stays the total for the
  // net calc, so Remaining still reconciles (collection − bills − general −
  // salaries = net).
  const inflow = sum(monthPayments ?? null);
  const expenseRows = (monthExpenses ?? []) as { amount: number | string | null; is_bill: boolean | null }[];
  const bills = expenseRows.filter((e) => e.is_bill).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const expenses = expenseRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const generalExpenses = expenses - bills;
  const salaries = sum(monthSalaries ?? null);
  const outflow = expenses + salaries;
  const net = inflow - outflow;

  // Prev-month flow (for trend deltas)
  const prevExpensesSum = sum(prevExpenses ?? null);
  const prevSalariesSum = sum(prevSalaries ?? null);
  const prevOutflow = prevExpensesSum + prevSalariesSum;
  const expenseDeltaPct =
    prevOutflow > 0 ? Math.round(((outflow - prevOutflow) / prevOutflow) * 100) : null;

  // Cash balance (cumulative) — uses server-side SUM so PostgREST max_rows
  // never silently truncates buildings with >1,000 historical records.
  // The opening balance only counts once its as-of date has arrived — viewing
  // a month before the society recorded its cash-in-hand shouldn't show money
  // it didn't have yet. A null date means "always applied" (legacy rows).
  const fundBalance = cashBalanceFrom(
    cashTotals,
    {
      amount: Number(building?.fund_balance ?? 0),
      date:
        (building as { opening_balance_date?: string | null } | null)
          ?.opening_balance_date ?? null,
    },
    monthEnd,
  );

  // Maintenance collection (money tied to current-month invoices)
  type InvRow = { id: string; amount: number | string | null; status: string | null; flat_id: string | null; bms_flats: { flat_number: string } | { flat_number: string }[] | null };
  let billedTotal = 0;
  let paidCount = 0;
  let totalInvCount = 0;
  const monthInvoiceIds: string[] = [];
  for (const i of (monthInvoices ?? []) as InvRow[]) {
    if (i.status === "waived") continue;
    billedTotal += Number(i.amount ?? 0);
    totalInvCount += 1;
    monthInvoiceIds.push(i.id);
    if (i.status === "paid") paidCount += 1;
  }
  let collected = 0;
  if (monthInvoiceIds.length > 0) {
    const { data: invPay } = await supabase
      .from("bms_payments")
      .select("amount")
      .in("invoice_id", monthInvoiceIds);
    collected = (invPay ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  }
  const collectionRate =
    billedTotal > 0 ? Math.round((collected / billedTotal) * 100) : 0;

  // Prev-month collection rate for delta (in percentage points)
  let prevBilled = 0;
  const prevIds: string[] = [];
  for (const i of prevInvoices ?? []) {
    if (i.status === "waived") continue;
    prevBilled += Number(i.amount ?? 0);
    prevIds.push(i.id);
  }
  let prevCollected = 0;
  if (prevIds.length > 0) {
    const { data: prevInvPay } = await supabase
      .from("bms_payments")
      .select("amount")
      .in("invoice_id", prevIds);
    prevCollected = (prevInvPay ?? []).reduce(
      (s, r) => s + Number(r.amount ?? 0),
      0,
    );
  }
  const prevRate = prevBilled > 0 ? (prevCollected / prevBilled) * 100 : 0;
  const collectionDelta =
    prevBilled > 0 ? Math.round(collectionRate - prevRate) : null;

  return (
    <>
      {/* Card 1 · Cash available (hero) — full width on mobile, leads the row */}
      <StatCard
        className="col-span-2 lg:col-span-1"
        hero
        href="/admin/reports"
        icon={Wallet}
        label="Cash available"
        value={formatCurrency(fundBalance)}
        sub={
          isCurrentMonth
            ? "Total cash held"
            : `Closing balance · end of ${monthLabel}`
        }
      />

      {/* Card 2 · Collection */}
      <StatCard
        href="/admin/maintenance"
        icon={CreditCard}
        tone="success"
        vividValue
        label="Collection"
        value={formatCurrency(collected)}
        sub={`${paidCount} of ${totalInvCount} paid`}
        trend={collectionDelta != null ? { value: collectionDelta, suffix: "pp" } : undefined}
      />

      {/* Card 3 · Remaining (this month) */}
      <StatCard
        href="/admin/reports"
        icon={Scale}
        tone={net >= 0 ? "success" : "danger"}
        vividValue
        label="Remaining"
        value={`${net < 0 ? "−" : ""}${formatCurrency(Math.abs(net))}`}
        sub={net > 0 ? "Surplus this month" : net < 0 ? "Deficit this month" : "Even this month"}
      />

      {/* Card 4 · Expenses — general operations only (bills shown separately) */}
      <StatCard
        href="/admin/expenses"
        icon={TrendingDown}
        tone="danger"
        vividValue
        label="Expenses"
        value={formatCurrency(generalExpenses)}
        sub="Repairs, supplies & upkeep"
        trend={
          expenseDeltaPct != null
            ? { value: expenseDeltaPct, suffix: "%", goodWhenUp: false }
            : undefined
        }
      />

      {/* Card 5 · Bills — utility bills (electricity, water, gas) */}
      <StatCard
        href="/admin/expenses"
        icon={Zap}
        tone="info"
        vividValue
        label="Bills Paid"
        value={formatCurrency(bills)}
        sub="Electricity, water & gas"
      />

      {/* Card 6 · Salaries */}
      <StatCard
        href="/admin/staff"
        icon={UserCog}
        tone="violet"
        vividValue
        label="Salaries"
        value={formatCurrency(salaries)}
        sub="Staff payroll"
      />
    </>
  );
}

// Skeleton tiles rendered as a bare fragment so they slot straight into the
// shared KPI grid as individual cells (matching the real cards' positions).
function CardSkeletons({ count, heroFirst = false }: { count: number; heroFirst?: boolean }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-2xl border border-border bg-card p-4 sm:p-5",
            heroFirst && i === 0 && "col-span-2 lg:col-span-1",
          )}
        >
          <div className="h-3 w-20 rounded bg-secondary/50 animate-pulse" />
          <div className="mt-2 h-7 w-28 rounded bg-secondary/60 animate-pulse" />
          <div className="mt-2 h-3 w-24 rounded bg-secondary/40 animate-pulse" />
        </div>
      ))}
    </>
  );
}

/* ═══════════════  3. Status tiles (Defaulters / Complaints)  ═══════════════ */

async function StatusTiles({
  buildingId,
  monthStart,
  prevMonthStart,
  todayIso,
}: {
  buildingId: string;
  monthStart: string;
  prevMonthStart: string;
  todayIso: string;
}) {
  const supabase = await createClient();

  const [
    { data: building },
    { data: flats },
    { data: outstandingInvoices },
    { data: complaintsAll },
  ] = await Promise.all([
    supabase
      .from("bms_buildings")
      .select("utility_cutoff_after_months")
      .eq("id", buildingId)
      .single(),
    supabase
      .from("bms_flats")
      .select("id, flat_number, outstanding_dues")
      .eq("building_id", buildingId),
    supabase
      .from("bms_invoices")
      .select("flat_id, billing_month")
      .eq("building_id", buildingId)
      .in("status", ["pending", "partial", "overdue"]),
    supabase
      .from("bms_complaints")
      .select("id, status, priority, created_at, resolved_at")
      .eq("building_id", buildingId)
      .gte("created_at", new Date(Date.now() - 60 * 86400_000).toISOString()),
  ]);

  // Long-term defaulters — flats with cutoff+ months unpaid
  const cutoff = Number(building?.utility_cutoff_after_months ?? 3);
  const flatById = new Map(
    (flats ?? []).map((f) => [f.id, f] as const),
  );
  const monthsByFlat = new Map<string, Set<string>>();
  for (const inv of outstandingInvoices ?? []) {
    if (!inv.flat_id || !inv.billing_month) continue;
    const m = String(inv.billing_month).slice(0, 7);
    if (!monthsByFlat.has(inv.flat_id)) monthsByFlat.set(inv.flat_id, new Set());
    monthsByFlat.get(inv.flat_id)!.add(m);
  }
  const defaulterFlats: string[] = [];
  let totalDefaulterOwed = 0;
  for (const [flatId, months] of monthsByFlat.entries()) {
    if (months.size < cutoff) continue;
    const f = flatById.get(flatId);
    if (!f?.flat_number) continue;
    defaulterFlats.push(f.flat_number);
    totalDefaulterOwed += Number(f.outstanding_dues ?? 0);
  }
  defaulterFlats.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  // Complaints — last 60 days context
  type Complaint = {
    id: string;
    status: string | null;
    priority: string | null;
    created_at: string;
    resolved_at: string | null;
  };
  const complaints = (complaintsAll ?? []) as Complaint[];
  const openComplaints = complaints.filter(
    (c) => c.status !== "resolved" && c.status !== "closed",
  );
  const urgentOpen = openComplaints.filter(
    (c) => c.priority === "urgent" || c.priority === "high",
  ).length;
  // Props still used elsewhere; explicit void to satisfy strict TS unused checks.
  void monthStart;
  void prevMonthStart;
  void todayIso;

  return (
    <>
      <StatCard
        icon={ShieldAlert}
        tone={defaulterFlats.length === 0 ? "success" : "warning"}
        vividValue
        label="Defaulters"
        value={
          defaulterFlats.length === 0
            ? "None"
            : `${defaulterFlats.length} ${defaulterFlats.length === 1 ? "flat" : "flats"}`
        }
        sub={
          defaulterFlats.length === 0
            ? "No long-term arrears"
            : `${formatLakh(totalDefaulterOwed)} owed`
        }
        href="/admin/maintenance"
      />
      <StatCard
        icon={MessageSquareWarning}
        // Cyan (info), not rose — the dashboard reserves rose for the single
        // Expenses card (matching HMS, where each tile carries its own accent
        // and only General Expenses is rose). Open complaints are an
        // informational count here, not an alarm.
        tone={openComplaints.length === 0 ? "success" : "info"}
        vividValue
        label="Complaints"
        value={openComplaints.length === 0 ? "Clear" : `${openComplaints.length} open`}
        sub={
          openComplaints.length === 0
            ? "No issues reported"
            : `${urgentOpen} urgent`
        }
        href="/admin/facility"
      />
    </>
  );
}

/* ═══════════════  4. Insights — pending payments + rev/exp trend  ═══════════════ */

async function DashboardInsights({
  buildingId,
  monthStart,
  sixMonthsAgo,
}: {
  buildingId: string;
  monthStart: string;
  sixMonthsAgo: string;
}) {
  const supabase = await createClient();

  const [payRes, expRes, salRes, pendingRes] = await Promise.all([
    supabase
      .from("bms_payments")
      .select("amount, payment_date")
      .eq("building_id", buildingId)
      .gte("payment_date", sixMonthsAgo),
    supabase
      .from("bms_expenses")
      .select("amount, expense_date")
      .eq("building_id", buildingId)
      .gte("expense_date", sixMonthsAgo),
    supabase
      .from("bms_salary_payments")
      .select("amount, payment_date")
      .eq("building_id", buildingId)
      .gte("payment_date", sixMonthsAgo),
    supabase
      .from("bms_invoices")
      .select("id, amount, status, flat_id, bms_flats!flat_id(flat_number)")
      .eq("building_id", buildingId)
      .eq("billing_month", monthStart)
      .in("status", ["pending", "partial"])
      .limit(50),
  ]);

  // ── 6-month revenue (payments) vs spend (expenses + salaries) ──
  const rev = new Map<string, number>();
  const spend = new Map<string, number>();
  for (const r of (payRes.data ?? []) as { amount: number | string | null; payment_date: string | null }[]) {
    const ym = String(r.payment_date ?? "").slice(0, 7);
    rev.set(ym, (rev.get(ym) ?? 0) + Number(r.amount ?? 0));
  }
  for (const r of (expRes.data ?? []) as { amount: number | string | null; expense_date: string | null }[]) {
    const ym = String(r.expense_date ?? "").slice(0, 7);
    spend.set(ym, (spend.get(ym) ?? 0) + Number(r.amount ?? 0));
  }
  for (const r of (salRes.data ?? []) as { amount: number | string | null; payment_date: string | null }[]) {
    const ym = String(r.payment_date ?? "").slice(0, 7);
    spend.set(ym, (spend.get(ym) ?? 0) + Number(r.amount ?? 0));
  }
  const chartData: RevExpPoint[] = sixMonthBuckets(sixMonthsAgo).map((b) => ({
    month: b.label,
    revenue: rev.get(b.ym) ?? 0,
    spend: spend.get(b.ym) ?? 0,
  }));

  // ── Pending payments this month (resident name + amount still owed) ──
  type PendInv = {
    id: string;
    amount: number | string | null;
    status: string;
    flat_id: string | null;
    bms_flats: { flat_number: string } | { flat_number: string }[] | null;
  };
  const pendingInv = (pendingRes.data ?? []) as PendInv[];
  const flatIds = Array.from(
    new Set(pendingInv.map((i) => i.flat_id).filter(Boolean)),
  ) as string[];
  const invIds = pendingInv.map((i) => i.id);

  const [resRes, payForInv] = await Promise.all([
    flatIds.length
      ? supabase.from("bms_residents").select("flat_id, full_name").eq("building_id", buildingId).in("flat_id", flatIds)
      : Promise.resolve({ data: [] as { flat_id: string; full_name: string }[] }),
    invIds.length
      ? supabase.from("bms_payments").select("invoice_id, amount").in("invoice_id", invIds)
      : Promise.resolve({ data: [] as { invoice_id: string; amount: number | string | null }[] }),
  ]);

  const nameByFlat = new Map<string, string>();
  for (const r of (resRes.data ?? []) as { flat_id: string; full_name: string }[]) {
    if (r.flat_id && !nameByFlat.has(r.flat_id)) nameByFlat.set(r.flat_id, r.full_name);
  }
  const paidByInv = new Map<string, number>();
  for (const p of (payForInv.data ?? []) as { invoice_id: string; amount: number | string | null }[]) {
    paidByInv.set(p.invoice_id, (paidByInv.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0));
  }
  function flatNumberOf(i: PendInv): string | null {
    const f = i.bms_flats;
    if (!f) return null;
    const obj = Array.isArray(f) ? f[0] : f;
    return (obj as { flat_number?: string })?.flat_number ?? null;
  }
  const pending = pendingInv
    .map((i) => {
      const flatNum = flatNumberOf(i);
      return {
        id: i.id,
        name: (i.flat_id && nameByFlat.get(i.flat_id)) || (flatNum ? `Flat ${flatNum}` : "Resident"),
        flatNum,
        status: i.status,
        amount: Number(i.amount ?? 0) - (paidByInv.get(i.id) ?? 0),
      };
    })
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const STATUS_LABEL: Record<string, string> = { pending: "Pending", partial: "Partially paid" };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Pending Payments */}
      <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Pending Payments</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Who hasn&apos;t paid this month</p>
          </div>
          {pending.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-[hsl(350_80%_68%/0.3)] bg-[hsl(350_80%_68%)]/15 px-1.5 text-[11px] font-bold tabular-nums text-[hsl(350_80%_68%)]">
              {pending.length}
            </span>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-center">
            <CheckCircle2 className="h-10 w-10 text-[hsl(151_70%_55%)] opacity-30" />
            <p className="text-sm font-medium text-[hsl(151_70%_55%)]">All caught up</p>
            <p className="text-xs text-muted-foreground">Every flat paid this month</p>
          </div>
        ) : (
          <div className="max-h-[280px] space-y-2 overflow-y-auto">
            {pending.map((p) => (
              <Link
                key={p.id}
                href="/admin/maintenance"
                className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 transition-colors hover:bg-secondary/60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-bold text-primary">
                  {p.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      p.status === "partial" ? "text-primary" : "text-[hsl(350_80%_68%)]",
                    )}
                  >
                    {STATUS_LABEL[p.status] ?? p.status}
                    {p.flatNum ? ` · Flat ${p.flatNum}` : ""}
                  </span>
                </div>
                <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                  {formatCurrency(p.amount)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Revenue vs Expenses */}
      <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Revenue vs Expenses</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              6-month trend — green above red = surplus
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-2.5 rounded-full" style={{ background: "hsl(151 70% 55%)" }} />
              Revenue
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-2.5 rounded-full" style={{ background: "hsl(350 80% 68%)" }} />
              Spend
            </span>
          </div>
        </div>
        <RevenueExpensesChart data={chartData} />
      </div>
    </div>
  );
}

function DashboardInsightsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-2 h-[320px] rounded-2xl border border-border bg-card animate-pulse" />
      <div className="lg:col-span-3 h-[320px] rounded-2xl border border-border bg-card animate-pulse" />
    </div>
  );
}
