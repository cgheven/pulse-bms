import Link from "next/link";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatLakh } from "@/lib/utils";
import { TableSkeleton, KpiRowSkeleton } from "@/components/layout/table-skeleton";
import {
  Receipt,
  Users,
  Home,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
} from "lucide-react";

export const dynamic = "force-dynamic";

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
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const ym = todayIso.slice(0, 7);
  const monthStart = `${ym}-01`;
  const monthLabel = new Date(`${monthStart}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div>
        <h1>Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Your building · {monthLabel}
        </p>
      </div>

      <Suspense fallback={<KpiRowSkeleton count={3} />}>
        <HeroInvoiceCard
          buildingId={buildingId}
          monthStart={monthStart}
          monthLabel={monthLabel}
          todayIso={todayIso}
        />
      </Suspense>

      <Suspense fallback={<KpiRowSkeleton count={4} />}>
        <KpiGrid
          buildingId={buildingId}
          monthStart={monthStart}
          todayIso={todayIso}
        />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <LowerRow buildingId={buildingId} />
      </Suspense>
    </div>
  );
}

async function HeroInvoiceCard({
  buildingId,
  monthStart,
  monthLabel,
  todayIso,
}: {
  buildingId: string;
  monthStart: string;
  monthLabel: string;
  todayIso: string;
}) {
  const supabase = await createClient();
  const { data: monthInvoices } = await supabase
    .from("bms_invoices")
    .select("id, flat_id, amount, status, due_date")
    .eq("building_id", buildingId)
    .eq("billing_month", monthStart);

  let monthTotal = 0;
  let monthCollected = 0;
  let monthPending = 0;
  let monthPaid = 0;
  let monthOverdue = 0;
  for (const inv of monthInvoices ?? []) {
    monthTotal += Number(inv.amount ?? 0);
    if (inv.status === "paid") {
      monthPaid += 1;
      monthCollected += Number(inv.amount ?? 0);
    } else if (inv.status === "pending") {
      if (inv.due_date && inv.due_date < todayIso) monthOverdue += 1;
      else monthPending += 1;
    } else if (inv.status === "partial") {
      monthPending += 1;
    }
  }

  return (
    <div className="card-hover glow-amber rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6 animate-count-up">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Invoices · {monthLabel}
          </p>
          <p className="mt-1.5 text-3xl sm:text-4xl font-bold tracking-tight tabular-nums text-foreground">
            {formatCurrency(monthCollected)}
            <span className="text-base text-muted-foreground font-medium ml-2">
              / {formatCurrency(monthTotal)}
            </span>
          </p>
          <p className="text-sm text-muted-foreground mt-1.5">Collected this month</p>
        </div>
        <Link
          href="/admin/billing"
          className="text-sm text-primary hover:underline font-medium"
        >
          Manage billing →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-lg border border-border/60 bg-card/60 p-3">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-[hsl(151_100%_45%)]" />
            Paid
          </div>
          <div className="text-2xl font-semibold tracking-tight tabular-nums mt-1.5 text-[hsl(151_100%_45%)]">{monthPaid}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/60 p-3">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Clock className="w-4 h-4 text-[hsl(38_92%_65%)]" />
            Pending
          </div>
          <div className="text-2xl font-semibold tracking-tight tabular-nums mt-1.5 text-[hsl(38_92%_65%)]">{monthPending}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/60 p-3">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Overdue
          </div>
          <div className="text-2xl font-semibold tracking-tight tabular-nums mt-1.5 text-destructive">{monthOverdue}</div>
        </div>
      </div>
    </div>
  );
}

async function KpiGrid({
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
    { data: building },
    { data: flats, count: flatsCount },
    { count: residentsCount },
    { data: monthInvoices },
  ] = await Promise.all([
    supabase
      .from("bms_buildings")
      .select("name, fund_balance, utility_cutoff_after_months, monthly_fee_default")
      .eq("id", buildingId)
      .single(),
    supabase
      .from("bms_flats")
      .select("id, flat_number, ownership_type, outstanding_dues, monthly_fee", {
        count: "exact",
      })
      .eq("building_id", buildingId),
    supabase
      .from("bms_residents")
      .select("id", { count: "exact", head: true })
      .eq("building_id", buildingId)
      .eq("is_active", true),
    supabase
      .from("bms_invoices")
      .select("id, flat_id, amount, status, due_date")
      .eq("building_id", buildingId)
      .eq("billing_month", monthStart),
  ]);

  let monthTotal = 0;
  let monthCollected = 0;
  let monthPending = 0;
  let monthOverdue = 0;
  for (const inv of monthInvoices ?? []) {
    monthTotal += Number(inv.amount ?? 0);
    if (inv.status === "paid") {
      monthCollected += Number(inv.amount ?? 0);
    } else if (inv.status === "pending") {
      if (inv.due_date && inv.due_date < todayIso) monthOverdue += 1;
      else monthPending += 1;
    } else if (inv.status === "partial") {
      monthPending += 1;
    }
  }

  const [{ data: paymentsAll }, { data: expensesAll }] = await Promise.all([
    supabase
      .from("bms_payments")
      .select("amount")
      .eq("building_id", buildingId),
    supabase
      .from("bms_expenses")
      .select("amount")
      .eq("building_id", buildingId),
  ]);
  const sumPay = (paymentsAll ?? []).reduce(
    (s, r) => s + Number(r.amount ?? 0),
    0,
  );
  const sumExp = (expensesAll ?? []).reduce(
    (s, r) => s + Number(r.amount ?? 0),
    0,
  );
  const fundBalance = Number(building?.fund_balance ?? 0) + sumPay - sumExp;

  const totalOutstanding = (flats ?? []).reduce(
    (s, f) => s + Number(f.outstanding_dues ?? 0),
    0,
  );
  const occupiedFlats = (flats ?? []).filter((f) => f.ownership_type !== "vacant").length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Kpi label="Total flats" value={String(flatsCount ?? 0)} icon={<Home className="w-4 h-4" />} />
      <Kpi label="Occupied" value={`${occupiedFlats} / ${flatsCount ?? 0}`} icon={<CheckCircle2 className="w-4 h-4" />} />
      <Kpi label="Active residents" value={String(residentsCount ?? 0)} icon={<Users className="w-4 h-4" />} />
      <Kpi label="Fund balance" value={formatLakh(fundBalance)} icon={<Wallet className="w-4 h-4" />} />
      <Kpi
        label="Outstanding dues"
        value={formatLakh(totalOutstanding)}
        icon={<AlertTriangle className="w-4 h-4" />}
        danger={totalOutstanding > 0}
      />
      <Kpi label="Collected (month)" value={formatCurrency(monthCollected)} icon={<TrendingUp className="w-4 h-4" />} />
      <Kpi label="Total billed" value={formatCurrency(monthTotal)} icon={<Receipt className="w-4 h-4" />} />
      <Kpi label="Pending invoices" value={String(monthPending + monthOverdue)} icon={<Clock className="w-4 h-4" />} />
    </div>
  );
}

async function LowerRow({ buildingId }: { buildingId: string }) {
  const supabase = await createClient();

  const [{ data: building }, { data: flats }, { data: recentPayments }] = await Promise.all([
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
      .from("bms_payments")
      .select("id, payment_date, amount, payment_mode, flat_id, category, receipt_no")
      .eq("building_id", buildingId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const cutoff = Number(building?.utility_cutoff_after_months ?? 3);
  const { data: outstandingInvoices } = await supabase
    .from("bms_invoices")
    .select("flat_id, billing_month, amount, status")
    .eq("building_id", buildingId)
    .in("status", ["pending", "partial", "overdue"]);

  const monthsByFlat = new Map<string, Set<string>>();
  for (const inv of outstandingInvoices ?? []) {
    if (!inv.flat_id || !inv.billing_month) continue;
    const m = String(inv.billing_month).slice(0, 7);
    if (!monthsByFlat.has(inv.flat_id)) monthsByFlat.set(inv.flat_id, new Set());
    monthsByFlat.get(inv.flat_id)!.add(m);
  }

  const flatMap = new Map((flats ?? []).map((f) => [f.id, f]));
  const defaulters: {
    id: string;
    flat_number: string;
    months_unpaid: number;
    outstanding: number;
  }[] = [];
  for (const [flatId, months] of monthsByFlat.entries()) {
    if (months.size >= cutoff) {
      const f = flatMap.get(flatId);
      if (!f) continue;
      defaulters.push({
        id: flatId,
        flat_number: f.flat_number,
        months_unpaid: months.size,
        outstanding: Number(f.outstanding_dues ?? 0),
      });
    }
  }
  defaulters.sort((a, b) => b.months_unpaid - a.months_unpaid);

  const recentFlatIds = Array.from(
    new Set((recentPayments ?? []).map((p) => p.flat_id).filter(Boolean) as string[]),
  );
  const recentFlatMap = new Map<string, string>();
  if (recentFlatIds.length) {
    const { data: rf } = await supabase
      .from("bms_flats")
      .select("id, flat_number")
      .in("id", recentFlatIds);
    for (const f of rf ?? []) recentFlatMap.set(f.id, f.flat_number);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-up animate-delay-150">
      <div className="card-soft card-hover">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
          <h2 className="text-base font-semibold tracking-tight">Recent payments</h2>
          <Link href="/admin/payments" className="text-sm text-primary hover:underline">
            View all →
          </Link>
        </div>
        {recentPayments?.length ? (
          <ul className="divide-y divide-border">
            {recentPayments.map((p) => (
              <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate text-sm">
                    {p.flat_id ? recentFlatMap.get(p.flat_id) ?? "—" : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.payment_date ? formatDate(p.payment_date) : "—"} ·{" "}
                    {p.payment_mode} · {p.receipt_no}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm tabular-nums">{formatCurrency(Number(p.amount))}</div>
                  <span className="status-paid inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wide">
                    {p.category}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No payments yet.</p>
        )}
      </div>

      <div className="card-soft card-hover transition-colors hover:border-destructive/40">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
          <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Defaulters
          </h2>
          <span className="text-xs text-muted-foreground">
            {cutoff}+ months unpaid
          </span>
        </div>
        {defaulters.length ? (
          <ul className="divide-y divide-border">
            {defaulters.map((d) => (
              <li key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <Link
                    href={`/admin/flats/${d.id}`}
                    className="font-semibold text-sm text-primary hover:underline whitespace-nowrap tabular-nums"
                  >
                    Flat {d.flat_number}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {d.months_unpaid} months unpaid
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm tabular-nums text-destructive">
                    {formatLakh(d.outstanding)}
                  </div>
                  <span className="status-defaulter inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wide">
                    Defaulter
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No defaulters. Nicely done.</p>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  danger,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="card-hover rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon && (
          <div className="flex w-8 h-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
            {icon}
          </div>
        )}
      </div>
      <div
        className={`mt-1.5 text-2xl font-semibold tracking-tight tabular-nums ${
          danger ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
