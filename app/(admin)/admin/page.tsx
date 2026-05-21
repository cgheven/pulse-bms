import Link from "next/link";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  cn,
  formatCurrency,
  formatDate,
  formatLakh,
  formatRelative,
} from "@/lib/utils";
import { KpiRowSkeleton, TableSkeleton } from "@/components/layout/table-skeleton";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileText,
  Megaphone,
  MessageSquareWarning,
  Receipt,
  Scale,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Vote,
  Wallet,
  Wrench,
} from "lucide-react";

export const dynamic = "force-dynamic";

const ACTIVITY_DAYS = 7;

export default async function AdminDashboardPage() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Admin Dashboard</h1>
        <p className="text-muted-foreground mt-2">No building assigned to your account.</p>
      </div>
    );
  }

  const buildingId = profile.building_id;
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const ym = todayIso.slice(0, 7);
  const monthStart = `${ym}-01`;
  const nextMonthStart = new Date(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    1,
  )
    .toISOString()
    .slice(0, 10);
  const prevMonthStart = new Date(
    now.getUTCFullYear(),
    now.getUTCMonth() - 1,
    1,
  )
    .toISOString()
    .slice(0, 10);
  const sixMonthsAgo = new Date(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)
    .toISOString()
    .slice(0, 10);
  const sevenDaysAgo = new Date(now.getTime() - ACTIVITY_DAYS * 86400_000)
    .toISOString();

  const monthLabel = new Date(`${monthStart}T00:00:00`).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );
  const todayLabel = new Date(now).toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="space-y-5 animate-fade-up max-w-5xl">
      <header>
        <h1>Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Sunrise · {monthLabel} · Today is {todayLabel}
        </p>
      </header>

      <Suspense fallback={<FinancialCardsSkeleton />}>
        <FinancialCards
          buildingId={buildingId}
          monthStart={monthStart}
          nextMonthStart={nextMonthStart}
          prevMonthStart={prevMonthStart}
          sixMonthsAgo={sixMonthsAgo}
          monthLabel={monthLabel}
        />
      </Suspense>

      <Suspense fallback={<KpiRowSkeleton count={3} />}>
        <StatusTiles
          buildingId={buildingId}
          monthStart={monthStart}
          prevMonthStart={prevMonthStart}
          todayIso={todayIso}
        />
      </Suspense>

      <Suspense fallback={<ActionCenterSkeleton />}>
        <ActionCenter
          buildingId={buildingId}
          monthStart={monthStart}
          todayIso={todayIso}
        />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <ActivityFeed buildingId={buildingId} sinceIso={sevenDaysAgo} />
      </Suspense>

      <ActionFooter />
    </div>
  );
}

/* ═══════════════  1. Action Center  ═══════════════ */

async function ActionCenter({
  buildingId,
  monthStart,
  todayIso,
}: {
  buildingId: string;
  monthStart: string;
  todayIso: string;
}) {
  const supabase = await createClient();

  const [
    { data: unpaidInvoices },
    { data: flats },
    { data: openComplaints },
    { data: openProposals },
    { data: openFacilityTasks },
  ] = await Promise.all([
    supabase
      .from("bms_invoices")
      .select("id, flat_id, amount, status, due_date")
      .eq("building_id", buildingId)
      .eq("billing_month", monthStart)
      .in("status", ["pending", "partial", "overdue"]),
    supabase
      .from("bms_flats")
      .select("id, flat_number, outstanding_dues")
      .eq("building_id", buildingId),
    supabase
      .from("bms_complaints")
      .select("id, title, priority, status, created_at")
      .eq("building_id", buildingId)
      .in("status", ["open", "in_progress"])
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("bms_proposals")
      .select("id, title, proposal_type, created_at")
      .eq("building_id", buildingId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("bms_facility_tasks")
      .select("id, title, priority, status, due_date")
      .eq("building_id", buildingId)
      .in("status", ["pending", "in_progress"])
      .order("priority", { ascending: false })
      .order("due_date", { ascending: true })
      .limit(2),
  ]);

  type FlatRow = { id: string; flat_number: string; outstanding_dues: number | null };
  const flatById = new Map(
    (flats ?? []).map((f) => [f.id, f as FlatRow] as const),
  );

  // Unpaid this month — surface with flat numbers + amount owed.
  const unpaidSorted = (unpaidInvoices ?? [])
    .map((i) => {
      const f = i.flat_id ? flatById.get(i.flat_id) : null;
      return {
        flat_number: f?.flat_number ?? "—",
        amount: Number(i.amount ?? 0),
        overdue:
          i.status === "overdue" ||
          Boolean(i.due_date && i.due_date < todayIso),
      };
    })
    .sort((a, b) =>
      a.flat_number.localeCompare(b.flat_number, undefined, { numeric: true }),
    );
  const unpaidTotal = unpaidSorted.reduce((s, u) => s + u.amount, 0);

  // Items array drives the rendering. Empty = "all clear" state.
  type Action = {
    icon: React.ReactNode;
    tone: "warning" | "danger" | "info";
    title: string;
    body: string;
    href: string;
    cta: string;
  };
  const actions: Action[] = [];

  if (unpaidSorted.length > 0) {
    const sample = unpaidSorted.slice(0, 4).map((u) => u.flat_number).join(" · ");
    const moreSuffix =
      unpaidSorted.length > 4 ? ` +${unpaidSorted.length - 4} more` : "";
    const overdueCount = unpaidSorted.filter((u) => u.overdue).length;
    actions.push({
      icon: <CreditCard className="w-4 h-4" />,
      tone: overdueCount > 0 ? "danger" : "warning",
      title: `${unpaidSorted.length} ${unpaidSorted.length === 1 ? "flat" : "flats"} unpaid · ${formatCurrency(unpaidTotal)} pending`,
      body: `${sample}${moreSuffix}${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}`,
      href: "/admin/maintenance?tab=dues",
      cta: "Send reminder",
    });
  }

  for (const c of openComplaints ?? []) {
    const isUrgent = c.priority === "urgent" || c.priority === "high";
    actions.push({
      icon: <MessageSquareWarning className="w-4 h-4" />,
      tone: isUrgent ? "danger" : "info",
      title: `Complaint · ${c.title}`,
      body: `${(c.priority ?? "normal").toString()} priority · ${formatRelative(c.created_at)}`,
      href: `/admin/facility`,
      cta: "Open complaint",
    });
    if (actions.length >= 6) break;
  }

  for (const p of openProposals ?? []) {
    actions.push({
      icon: <Vote className="w-4 h-4" />,
      tone: "info",
      title: `Vote needed · ${p.title}`,
      body: `${(p.proposal_type ?? "other")} · raised ${formatRelative(p.created_at)}`,
      href: `/admin/union`,
      cta: "Review",
    });
    if (actions.length >= 6) break;
  }

  for (const t of openFacilityTasks ?? []) {
    const isUrgent = t.priority === "urgent" || t.priority === "high";
    actions.push({
      icon: <Wrench className="w-4 h-4" />,
      tone: isUrgent ? "danger" : "info",
      title: `Task · ${t.title}`,
      body: t.due_date
        ? `due ${formatDate(t.due_date)} · ${(t.priority ?? "normal").toString()} priority`
        : `${(t.priority ?? "normal").toString()} priority`,
      href: `/admin/facility`,
      cta: "Open task",
    });
    if (actions.length >= 6) break;
  }

  const isEmpty = actions.length === 0;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 sm:p-5",
        isEmpty
          ? "border-[hsl(151_70%_55%/0.25)]"
          : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-border">
        <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
          {isEmpty ? (
            <CheckCircle2 className="w-4 h-4 text-[hsl(151_70%_55%)]" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-primary" />
          )}
          {isEmpty ? "Nothing on your plate today" : "Needs your attention"}
        </h2>
        {!isEmpty && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {actions.length} {actions.length === 1 ? "item" : "items"}
          </span>
        )}
      </div>

      {isEmpty ? (
        <p className="text-xs text-muted-foreground">
          No unpaid flats, no open complaints, no pending votes. Building is running smoothly.
        </p>
      ) : (
        <ul className="space-y-2">
          {actions.map((a, i) => {
            const ring =
              a.tone === "danger"
                ? "border-l-destructive"
                : a.tone === "warning"
                  ? "border-l-primary"
                  : "border-l-[hsl(210_90%_60%)]";
            const iconColor =
              a.tone === "danger"
                ? "text-destructive"
                : a.tone === "warning"
                  ? "text-primary"
                  : "text-[hsl(210_90%_70%)]";
            return (
              <li
                key={i}
                className={cn(
                  "rounded-md border border-border border-l-2 bg-secondary/20 hover:bg-secondary/40 transition-colors",
                  ring,
                )}
              >
                <Link
                  href={a.href}
                  className="flex items-start gap-3 px-3 py-2.5"
                >
                  <span
                    className={cn(
                      "flex w-7 h-7 items-center justify-center rounded-md bg-card border border-border shrink-0",
                      iconColor,
                    )}
                  >
                    {a.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground line-clamp-1">
                      {a.title}
                    </span>
                    <span className="block text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                      {a.body}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary shrink-0">
                    {a.cta}
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActionCenterSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 animate-fade-in">
      <div className="h-4 w-40 rounded bg-secondary/50 animate-pulse mb-3 pb-3 border-b border-border" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-md border border-border bg-secondary/20 h-12 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════  2. Financial cards · 2×2 grid  ═══════════════ */

async function FinancialCards({
  buildingId,
  monthStart,
  nextMonthStart,
  prevMonthStart,
  sixMonthsAgo,
  monthLabel,
}: {
  buildingId: string;
  monthStart: string;
  nextMonthStart: string;
  prevMonthStart: string;
  sixMonthsAgo: string;
  monthLabel: string;
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
    { data: allPayments },
    { data: allExpenses },
    { data: allSalaries },
    { data: monthInvoices },
    { data: prevInvoices },
  ] = await Promise.all([
    supabase.from("bms_buildings").select("fund_balance").eq("id", buildingId).single(),
    supabase
      .from("bms_payments")
      .select("amount")
      .eq("building_id", buildingId)
      .gte("payment_date", monthStart)
      .lt("payment_date", nextMonthStart),
    supabase
      .from("bms_expenses")
      .select("amount")
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
    supabase.from("bms_payments").select("amount").eq("building_id", buildingId),
    supabase.from("bms_expenses").select("amount").eq("building_id", buildingId),
    supabase.from("bms_salary_payments").select("amount").eq("building_id", buildingId),
    supabase
      .from("bms_invoices")
      .select("id, amount, status")
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

  // This-month flow
  const inflow = sum(monthPayments ?? null);
  const expenses = sum(monthExpenses ?? null);
  const salaries = sum(monthSalaries ?? null);
  const outflow = expenses + salaries;
  const net = inflow - outflow;

  // Prev-month flow (for trend deltas)
  const prevExpensesSum = sum(prevExpenses ?? null);
  const prevSalariesSum = sum(prevSalaries ?? null);
  const prevOutflow = prevExpensesSum + prevSalariesSum;
  const expenseDeltaPct =
    prevOutflow > 0 ? Math.round(((outflow - prevOutflow) / prevOutflow) * 100) : null;

  // Cash balance (cumulative)
  const fundBalance =
    Number(building?.fund_balance ?? 0) +
    sum(allPayments ?? null) -
    sum(allExpenses ?? null) -
    sum(allSalaries ?? null);

  // Maintenance collection (money tied to current-month invoices)
  let billedTotal = 0;
  let paidCount = 0;
  let totalInvCount = 0;
  const monthInvoiceIds: string[] = [];
  for (const i of monthInvoices ?? []) {
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Card 1 · Cash available (hero) */}
      <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/8 via-card to-card p-4 sm:p-5 glow-amber">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <Wallet className="w-3.5 h-3.5 text-primary" />
          Cash available
        </div>
        <div className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-foreground">
          {formatCurrency(fundBalance)}
        </div>
        <div className="mt-3">
          <p className="text-[11px] text-muted-foreground">Total cash held</p>
        </div>
      </div>

      {/* Card 2 · Maintenance collection */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <CreditCard className="w-3.5 h-3.5 text-[hsl(151_70%_55%)]" />
          Maintenance collection
        </div>
        <div className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-[hsl(151_70%_55%)]">
          {formatCurrency(collected)}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-muted-foreground">
            <span className="tabular-nums">{paidCount} of {totalInvCount}</span> paid
          </p>
          {collectionDelta != null && collectionDelta !== 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[11px] tabular-nums font-medium",
                collectionDelta >= 0
                  ? "text-[hsl(151_70%_55%)]"
                  : "text-destructive",
              )}
            >
              {collectionDelta >= 0 ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              {collectionDelta >= 0 ? "+" : ""}
              {collectionDelta}pp
            </span>
          )}
        </div>
      </div>

      {/* Card 3 · Expenses — clickable, navigates to full expenses ledger */}
      <Link
        href="/admin/expenses"
        className="rounded-xl border border-border bg-card p-4 sm:p-5 block transition-colors hover:border-destructive/40 hover:bg-secondary/30 group"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <TrendingDown className="w-3.5 h-3.5 text-destructive" />
            Expenses
          </div>
          <ArrowRight className="w-3 h-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-destructive" />
        </div>
        <div className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-destructive">
          {formatCurrency(outflow)}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-muted-foreground">
            Operations <span className="tabular-nums">{formatLakh(expenses)}</span> ·{" "}
            Salary <span className="tabular-nums">{formatLakh(salaries)}</span>
          </p>
          {expenseDeltaPct != null && expenseDeltaPct !== 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[11px] tabular-nums font-medium",
                // For expenses, going DOWN is good (success), going UP is bad (danger)
                expenseDeltaPct < 0
                  ? "text-[hsl(151_70%_55%)]"
                  : "text-destructive",
              )}
            >
              {expenseDeltaPct < 0 ? (
                <ArrowDownRight className="w-3 h-3" />
              ) : (
                <ArrowUpRight className="w-3 h-3" />
              )}
              {expenseDeltaPct >= 0 ? "+" : ""}
              {expenseDeltaPct}% vs last month
            </span>
          )}
        </div>
      </Link>

      {/* Card 4 · Remaining (this month) */}
      <div
        className={cn(
          "rounded-xl border bg-card p-4 sm:p-5",
          net >= 0
            ? "border-[hsl(151_70%_55%/0.25)]"
            : "border-destructive/30",
        )}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <Scale className="w-3.5 h-3.5 text-foreground" />
          Remaining · {monthLabel}
        </div>
        <div
          className={cn(
            "mt-1.5 text-xl sm:text-2xl font-bold tracking-tight tabular-nums",
            net >= 0 ? "text-[hsl(151_70%_55%)]" : "text-destructive",
          )}
        >
          {net >= 0 ? "+" : "−"}
          {formatCurrency(Math.abs(net))}
        </div>
        <div className="mt-3">
          <p className="text-[11px] text-muted-foreground">
            {net >= 0
              ? "Surplus · collection > spend this month"
              : "Deficit · spending more than collecting"}
          </p>
        </div>
      </div>
    </div>
  );
}

function FinancialCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="h-3 w-28 rounded bg-secondary/50 animate-pulse" />
          <div className="mt-2 h-8 w-40 rounded bg-secondary/60 animate-pulse" />
          <div className="mt-3 h-3 w-32 rounded bg-secondary/40 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/* ═══════════════  3. Status tiles (Defaulters / Complaints / Governance)  ═══════════════ */

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
    { data: proposalsPending },
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
    supabase
      .from("bms_proposals")
      .select("id")
      .eq("building_id", buildingId)
      .eq("status", "pending"),
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
  const resolved = complaints.filter(
    (c) => (c.status === "resolved" || c.status === "closed") && c.resolved_at,
  );
  const avgResolveDays =
    resolved.length > 0
      ? Math.round(
          resolved.reduce((s, c) => {
            const ms =
              new Date(c.resolved_at as string).getTime() -
              new Date(c.created_at).getTime();
            return s + ms / 86400_000;
          }, 0) / resolved.length,
        )
      : null;

  // Props still used elsewhere; explicit void to satisfy strict TS unused checks.
  void monthStart;
  void prevMonthStart;
  void todayIso;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatusTile
        label={`Defaulters · ${cutoff}+ months`}
        primary={
          defaulterFlats.length === 0
            ? "None"
            : `${defaulterFlats.length} ${defaulterFlats.length === 1 ? "flat" : "flats"}`
        }
        secondary={
          defaulterFlats.length === 0
            ? "No long-term arrears"
            : `${defaulterFlats.slice(0, 4).join(" · ")}${defaulterFlats.length > 4 ? " …" : ""} · ${formatLakh(totalDefaulterOwed)} owed`
        }
        tone={defaulterFlats.length === 0 ? "ok" : "risk"}
        href="/admin/maintenance?tab=dues"
      />
      <StatusTile
        label="Complaints"
        primary={
          openComplaints.length === 0
            ? "Clear"
            : `${openComplaints.length} open`
        }
        secondary={
          openComplaints.length === 0
            ? "No issues reported"
            : `${urgentOpen} urgent${avgResolveDays !== null ? ` · avg resolve ${avgResolveDays}d` : ""}`
        }
        tone={
          openComplaints.length === 0
            ? "ok"
            : urgentOpen > 0
              ? "risk"
              : "warning"
        }
        href="/admin/facility"
      />
      <StatusTile
        label="Governance"
        primary={
          (proposalsPending ?? []).length === 0
            ? "Quiet"
            : `${(proposalsPending ?? []).length} pending vote${(proposalsPending ?? []).length === 1 ? "" : "s"}`
        }
        secondary={
          (proposalsPending ?? []).length === 0
            ? "No open proposals"
            : "Awaiting union votes"
        }
        tone={(proposalsPending ?? []).length === 0 ? "ok" : "warning"}
        href="/admin/union"
      />
    </div>
  );
}

function StatusTile({
  label,
  primary,
  secondary,
  delta,
  deltaLabel,
  tone,
  href,
}: {
  label: string;
  primary: string;
  secondary: string;
  delta?: number | null;
  deltaLabel?: string;
  tone: "ok" | "warning" | "risk";
  /** When set, the whole tile becomes a deep-link card with hover affordance. */
  href?: string;
}) {
  const accent =
    tone === "ok"
      ? "text-[hsl(151_70%_55%)]"
      : tone === "warning"
        ? "text-primary"
        : "text-destructive";
  const borderL =
    tone === "ok"
      ? "border-l-[hsl(151_70%_55%)]"
      : tone === "warning"
        ? "border-l-primary"
        : "border-l-destructive";
  const wrapperCls = cn(
    "rounded-lg border border-border border-l-2 bg-card p-4 transition-colors",
    borderL,
    href && "hover:border-primary/40 hover:bg-secondary/30 cursor-pointer group block",
  );

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {href && (
          <ArrowRight className="w-3 h-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        )}
      </div>
      <div
        className={cn(
          "mt-1 text-xl sm:text-2xl font-semibold tracking-tight tabular-nums truncate",
          accent,
        )}
      >
        {primary}
      </div>
      <div className="mt-1 text-xs text-muted-foreground line-clamp-1">
        {secondary}
      </div>
      {delta != null && (
        <div
          className={cn(
            "mt-1 inline-flex items-center gap-0.5 text-[11px] tabular-nums font-medium",
            delta >= 0 ? "text-[hsl(151_70%_55%)]" : "text-destructive",
          )}
        >
          {delta >= 0 ? (
            <ArrowUpRight className="w-3 h-3" />
          ) : (
            <ArrowDownRight className="w-3 h-3" />
          )}
          {delta >= 0 ? "+" : ""}
          {delta}pp {deltaLabel}
        </div>
      )}
    </>
  );

  return href ? (
    <Link href={href} className={wrapperCls}>
      {body}
    </Link>
  ) : (
    <div className={wrapperCls}>{body}</div>
  );
}

/* ═══════════════  4. Activity feed (last 7 days)  ═══════════════ */

type FeedItem = {
  ts: string;
  icon: React.ReactNode;
  iconColor: string;
  title: React.ReactNode;
  amount?: number;
  amountSign?: "+" | "−";
};

async function ActivityFeed({
  buildingId,
  sinceIso,
}: {
  buildingId: string;
  sinceIso: string;
}) {
  const supabase = await createClient();

  const [
    { data: payments },
    { data: expenses },
    { data: salaries },
    { data: complaints },
    { data: proposals },
    { data: notices },
    { data: moveIns },
  ] = await Promise.all([
    supabase
      .from("bms_payments")
      .select(
        "id, amount, payment_date, created_at, payment_mode, flat_id, bms_flats(flat_number)",
      )
      .eq("building_id", buildingId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("bms_expenses")
      .select("id, amount, expense_date, created_at, description, vendor, category")
      .eq("building_id", buildingId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("bms_salary_payments")
      .select(
        "id, amount, payment_date, created_at, staff_id, bms_staff(full_name, role)",
      )
      .eq("building_id", buildingId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("bms_complaints")
      .select("id, title, priority, created_at, status, resolved_at")
      .eq("building_id", buildingId)
      .or(`created_at.gte.${sinceIso},resolved_at.gte.${sinceIso}`)
      .limit(20),
    supabase
      .from("bms_proposals")
      .select("id, title, proposal_type, status, created_at")
      .eq("building_id", buildingId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("bms_notices")
      .select("id, title, notice_type, pinned, created_at")
      .eq("building_id", buildingId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("bms_residents")
      .select(
        "id, full_name, move_in_date, created_at, bms_flats(flat_number)",
      )
      .eq("building_id", buildingId)
      .gte("move_in_date", sinceIso.slice(0, 10))
      .order("move_in_date", { ascending: false })
      .limit(10),
  ]);

  const items: FeedItem[] = [];

  type FlatRel = { flat_number: string } | { flat_number: string }[] | null;
  const flatOf = (rel: FlatRel) =>
    rel ? (Array.isArray(rel) ? rel[0]?.flat_number : rel.flat_number) : null;
  type StaffRel =
    | { full_name: string; role: string }
    | { full_name: string; role: string }[]
    | null;
  const staffOf = (rel: StaffRel) =>
    rel ? (Array.isArray(rel) ? rel[0] : rel) : null;

  for (const p of payments ?? []) {
    items.push({
      ts: p.created_at,
      icon: <CreditCard className="w-3.5 h-3.5" />,
      iconColor: "text-[hsl(151_70%_55%)] bg-[hsl(151_70%_55%/0.1)]",
      title: (
        <>
          Maintenance paid · Flat{" "}
          <span className="font-medium text-foreground">
            {flatOf(p.bms_flats as FlatRel) ?? "—"}
          </span>
          <span className="text-muted-foreground"> · {p.payment_mode ?? "—"}</span>
        </>
      ),
      amount: Number(p.amount ?? 0),
      amountSign: "+",
    });
  }
  for (const e of expenses ?? []) {
    items.push({
      ts: e.created_at,
      icon: <Receipt className="w-3.5 h-3.5" />,
      iconColor: "text-destructive bg-destructive/10",
      title: (
        <>
          <span className="text-foreground font-medium">{e.description}</span>
          {e.vendor && (
            <span className="text-muted-foreground"> · {e.vendor}</span>
          )}
          <span className="text-muted-foreground"> · {e.category}</span>
        </>
      ),
      amount: Number(e.amount ?? 0),
      amountSign: "−",
    });
  }
  for (const s of salaries ?? []) {
    const staff = staffOf(s.bms_staff as StaffRel);
    items.push({
      ts: s.created_at,
      icon: <Wallet className="w-3.5 h-3.5" />,
      iconColor: "text-destructive bg-destructive/10",
      title: (
        <>
          Salary paid ·{" "}
          <span className="font-medium text-foreground">
            {staff?.full_name ?? "Staff"}
          </span>
          {staff?.role && (
            <span className="text-muted-foreground"> · {staff.role.replace("_", " ")}</span>
          )}
        </>
      ),
      amount: Number(s.amount ?? 0),
      amountSign: "−",
    });
  }
  for (const c of complaints ?? []) {
    const resolved =
      c.resolved_at &&
      new Date(c.resolved_at).getTime() >= new Date(sinceIso).getTime();
    items.push({
      ts: resolved ? (c.resolved_at as string) : c.created_at,
      icon: resolved ? (
        <CheckCircle2 className="w-3.5 h-3.5" />
      ) : (
        <MessageSquareWarning className="w-3.5 h-3.5" />
      ),
      iconColor: resolved
        ? "text-[hsl(151_70%_55%)] bg-[hsl(151_70%_55%/0.1)]"
        : c.priority === "urgent" || c.priority === "high"
          ? "text-destructive bg-destructive/10"
          : "text-[hsl(210_90%_70%)] bg-[hsl(210_90%_60%/0.1)]",
      title: (
        <>
          {resolved ? "Complaint resolved" : "New complaint"} ·{" "}
          <span className="font-medium text-foreground">{c.title}</span>
          {!resolved && c.priority && (
            <span className="text-muted-foreground"> · {c.priority}</span>
          )}
        </>
      ),
    });
  }
  for (const p of proposals ?? []) {
    items.push({
      ts: p.created_at,
      icon: <Vote className="w-3.5 h-3.5" />,
      iconColor: "text-primary bg-primary/10",
      title: (
        <>
          Proposal raised ·{" "}
          <span className="font-medium text-foreground">{p.title}</span>
          {p.proposal_type && (
            <span className="text-muted-foreground"> · {p.proposal_type}</span>
          )}
        </>
      ),
    });
  }
  for (const n of notices ?? []) {
    items.push({
      ts: n.created_at,
      icon: <Megaphone className="w-3.5 h-3.5" />,
      iconColor: "text-primary bg-primary/10",
      title: (
        <>
          {n.pinned ? "Pinned notice" : "Notice posted"} ·{" "}
          <span className="font-medium text-foreground">{n.title}</span>
          {n.notice_type && (
            <span className="text-muted-foreground"> · {n.notice_type}</span>
          )}
        </>
      ),
    });
  }
  for (const m of moveIns ?? []) {
    items.push({
      ts: m.created_at,
      icon: <UserPlus className="w-3.5 h-3.5" />,
      iconColor: "text-[hsl(210_90%_70%)] bg-[hsl(210_90%_60%/0.1)]",
      title: (
        <>
          Move-in ·{" "}
          <span className="font-medium text-foreground">{m.full_name}</span>
          <span className="text-muted-foreground">
            {" "}
            → Flat {flatOf(m.bms_flats as FlatRel) ?? "—"}
          </span>
        </>
      ),
    });
  }

  items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const top = items.slice(0, 18);

  // Group by day (today/yesterday/date)
  const byDay = new Map<string, FeedItem[]>();
  for (const it of top) {
    const d = new Date(it.ts);
    const key = d.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(it);
  }
  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterdayKey = new Date(Date.now() - 86400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-border">
        <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Recent activity
        </h2>
        <span className="text-[11px] text-muted-foreground">Last {ACTIVITY_DAYS} days</span>
      </div>

      {top.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No activity in the last week.
        </p>
      ) : (
        <div className="space-y-4">
          {Array.from(byDay.entries()).map(([day, dayItems]) => {
            const label =
              day === todayKey
                ? "Today"
                : day === yesterdayKey
                  ? "Yesterday"
                  : formatDate(day);
            return (
              <div key={day}>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                  {label}
                </div>
                <ul className="space-y-1.5">
                  {dayItems.map((it, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 px-2 py-1.5 rounded-md hover:bg-secondary/30 transition-colors"
                    >
                      <span
                        className={cn(
                          "flex w-6 h-6 items-center justify-center rounded-md shrink-0 mt-0.5",
                          it.iconColor,
                        )}
                      >
                        {it.icon}
                      </span>
                      <span className="text-xs text-foreground/90 min-w-0 flex-1 line-clamp-1">
                        {it.title}
                      </span>
                      {it.amount != null && (
                        <span
                          className={cn(
                            "text-xs font-medium tabular-nums shrink-0",
                            it.amountSign === "+"
                              ? "text-[hsl(151_70%_55%)]"
                              : "text-destructive",
                          )}
                        >
                          {it.amountSign}
                          {formatCurrency(it.amount).replace("Rs. ", "Rs ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ═══════════════  5. Action footer  ═══════════════ */

function ActionFooter() {
  return (
    <nav className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
      <ActionLink
        href="/admin/reports"
        icon={<TrendingUp className="w-4 h-4" />}
        title="Reports"
        sub="P&L · ledger · CSV / PDF download"
      />
      <ActionLink
        href="/admin/maintenance?tab=invoices"
        icon={<FileText className="w-4 h-4" />}
        title="Maintenance"
        sub="Generate · waive · review invoices"
      />
      <ActionLink
        href="/admin/maintenance?tab=payments"
        icon={<Receipt className="w-4 h-4" />}
        title="Record payment"
        sub="Mark a flat as paid"
      />
    </nav>
  );
}

function ActionLink({
  href,
  icon,
  title,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-border bg-card p-3.5 flex items-start gap-2.5 transition-colors hover:border-primary/40 hover:bg-secondary/30"
    >
      <div className="flex w-8 h-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0 group-hover:bg-primary/15">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold flex items-center gap-1">
          {title}
          <ArrowRight className="w-3 h-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {sub}
        </div>
      </div>
    </Link>
  );
}
