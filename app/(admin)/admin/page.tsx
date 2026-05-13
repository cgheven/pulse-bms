import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatLakh } from "@/lib/utils";
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
  const supabase = await createClient();

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const ym = todayIso.slice(0, 7);
  const monthStart = `${ym}-01`;

  const [
    { data: building },
    { data: flats, count: flatsCount },
    { count: residentsCount },
    { data: monthInvoices },
    { data: recentPayments },
  ] = await Promise.all([
    supabase
      .from("bms_buildings")
      .select("name, fund_balance, utility_cutoff_after_months, monthly_fee_default")
      .eq("id", profile.building_id)
      .single(),
    supabase
      .from("bms_flats")
      .select("id, flat_number, ownership_type, outstanding_dues, monthly_fee", {
        count: "exact",
      })
      .eq("building_id", profile.building_id),
    supabase
      .from("bms_residents")
      .select("id", { count: "exact", head: true })
      .eq("building_id", profile.building_id)
      .eq("is_active", true),
    supabase
      .from("bms_invoices")
      .select("id, flat_id, amount, status, due_date")
      .eq("building_id", profile.building_id)
      .eq("billing_month", monthStart),
    supabase
      .from("bms_payments")
      .select("id, payment_date, amount, payment_mode, flat_id, category, receipt_no")
      .eq("building_id", profile.building_id)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // KPIs from month invoices
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

  // Compute fund balance: building.fund_balance + payments - expenses (all-time)
  const [{ data: paymentsAll }, { data: expensesAll }] = await Promise.all([
    supabase
      .from("bms_payments")
      .select("amount")
      .eq("building_id", profile.building_id),
    supabase
      .from("bms_expenses")
      .select("amount")
      .eq("building_id", profile.building_id),
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

  // Outstanding & defaulters
  const totalOutstanding = (flats ?? []).reduce(
    (s, f) => s + Number(f.outstanding_dues ?? 0),
    0,
  );
  const occupiedFlats = (flats ?? []).filter((f) => f.ownership_type !== "vacant").length;

  // Defaulters — 3+ months unpaid: look at pending+overdue invoices grouped by flat
  const cutoff = Number(building?.utility_cutoff_after_months ?? 3);
  const { data: outstandingInvoices } = await supabase
    .from("bms_invoices")
    .select("flat_id, billing_month, amount, status")
    .eq("building_id", profile.building_id)
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

  // Recent payment flat names
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

  const monthLabel = new Date(`${monthStart}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div>
        <h1>Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          {building?.name ?? "Your building"} · {monthLabel}
        </p>
      </div>

      {/* Hero: current month invoice status */}
      <div className="card-hover glow-amber rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8 animate-count-up">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Invoices · {monthLabel}
            </p>
            <p className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
              {formatCurrency(monthCollected)}
              <span className="text-lg text-muted-foreground font-medium ml-2">
                / {formatCurrency(monthTotal)}
              </span>
            </p>
            <p className="text-sm text-muted-foreground mt-2">Collected this month</p>
          </div>
          <Link
            href="/admin/billing"
            className="text-sm text-primary hover:underline font-medium"
          >
            Manage billing →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-xl border border-border/60 bg-card/60 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-[hsl(151_100%_45%)]" />
              Paid
            </div>
            <div className="text-3xl font-bold mt-2 text-[hsl(151_100%_45%)]">{monthPaid}</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Clock className="w-4 h-4 text-[hsl(38_92%_65%)]" />
              Pending
            </div>
            <div className="text-3xl font-bold mt-2 text-[hsl(38_92%_65%)]">{monthPending}</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Overdue
            </div>
            <div className="text-3xl font-bold mt-2 text-destructive">{monthOverdue}</div>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-up animate-delay-150">
        <Kpi label="Total flats" value={String(flatsCount ?? 0)} icon={<Home className="w-5 h-5" />} />
        <Kpi label="Occupied" value={`${occupiedFlats} / ${flatsCount ?? 0}`} icon={<CheckCircle2 className="w-5 h-5" />} />
        <Kpi label="Active residents" value={String(residentsCount ?? 0)} icon={<Users className="w-5 h-5" />} />
        <Kpi label="Fund balance" value={formatLakh(fundBalance)} icon={<Wallet className="w-5 h-5" />} />
        <Kpi
          label="Outstanding dues"
          value={formatLakh(totalOutstanding)}
          icon={<AlertTriangle className="w-5 h-5" />}
          danger={totalOutstanding > 0}
        />
        <Kpi label="Collected (month)" value={formatCurrency(monthCollected)} icon={<TrendingUp className="w-5 h-5" />} />
        <Kpi label="Total billed" value={formatCurrency(monthTotal)} icon={<Receipt className="w-5 h-5" />} />
        <Kpi label="Pending invoices" value={String(monthPending + monthOverdue)} icon={<Clock className="w-5 h-5" />} />
      </div>

      {/* Recent payments + Defaulters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up animate-delay-300">
        <div className="card-soft card-hover">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <h2 className="text-xl font-semibold">Recent payments</h2>
            <Link href="/admin/payments" className="text-sm text-primary hover:underline">
              View all →
            </Link>
          </div>
          {recentPayments?.length ? (
            <ul className="divide-y divide-border">
              {recentPayments.map((p) => (
                <li key={p.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {p.flat_id ? recentFlatMap.get(p.flat_id) ?? "—" : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.payment_date ? formatDate(p.payment_date) : "—"} ·{" "}
                      {p.payment_mode} · {p.receipt_no}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(Number(p.amount))}</div>
                    <span className="status-paid inline-flex px-2 py-0.5 rounded-full text-xs">
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
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Defaulters
            </h2>
            <span className="text-xs text-muted-foreground">
              {cutoff}+ months unpaid
            </span>
          </div>
          {defaulters.length ? (
            <ul className="divide-y divide-border">
              {defaulters.map((d) => (
                <li key={d.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <Link
                      href={`/admin/flats/${d.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      Flat {d.flat_number}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {d.months_unpaid} months unpaid
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-destructive">
                      {formatLakh(d.outstanding)}
                    </div>
                    <span className="status-defaulter inline-flex px-2 py-0.5 rounded-full text-xs">
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

      {/* Quick actions */}
      <div className="card-soft animate-fade-up animate-delay-300">
        <h2 className="text-xl font-semibold mb-4">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/billing"
            className="btn-big inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Receipt className="w-5 h-5" /> Generate invoices
          </Link>
          <Link
            href="/admin/payments"
            className="btn-big inline-flex items-center gap-2 bg-secondary text-foreground hover:bg-secondary/80"
          >
            <Wallet className="w-5 h-5" /> Record payment
          </Link>
          <Link
            href="/admin/residents"
            className="btn-big inline-flex items-center gap-2 bg-secondary text-foreground hover:bg-secondary/80"
          >
            <Users className="w-5 h-5" /> Manage residents
          </Link>
        </div>
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
    <div className="card-hover rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon && (
          <div className="flex w-10 h-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        )}
      </div>
      <div
        className={`mt-2 text-3xl font-bold tracking-tight ${
          danger ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
