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

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1>Admin Dashboard</h1>
        <p className="text-muted-foreground">{building?.name ?? "Your building"} — snapshot for {ym}.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Total flats" value={String(flatsCount ?? 0)} icon={<Home className="w-5 h-5" />} />
        <Kpi label="Occupied" value={`${occupiedFlats} / ${flatsCount ?? 0}`} icon={<CheckCircle2 className="w-5 h-5" />} />
        <Kpi label="Active residents" value={String(residentsCount ?? 0)} icon={<Users className="w-5 h-5" />} />
        <Kpi label="Fund balance" value={formatLakh(fundBalance)} icon={<Wallet className="w-5 h-5" />} accent="success" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi label="This month total" value={formatCurrency(monthTotal)} icon={<Receipt className="w-5 h-5" />} />
        <Kpi label="Collected" value={formatCurrency(monthCollected)} icon={<TrendingUp className="w-5 h-5" />} accent="success" />
        <Kpi label="Paid" value={String(monthPaid)} icon={<CheckCircle2 className="w-5 h-5" />} />
        <Kpi label="Pending" value={String(monthPending)} icon={<Clock className="w-5 h-5" />} accent="warning" />
        <Kpi label="Overdue" value={String(monthOverdue)} icon={<AlertTriangle className="w-5 h-5" />} accent="destructive" />
      </div>

      <div className="card-soft">
        <div className="flex items-center justify-between mb-2">
          <h3>Total outstanding dues</h3>
          <span className="text-xs text-muted-foreground">Across all flats</span>
        </div>
        <div className="text-3xl font-bold text-destructive">{formatLakh(totalOutstanding)}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-soft">
          <div className="flex items-center justify-between mb-3">
            <h3>Recent payments</h3>
            <Link href="/admin/payments" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          {recentPayments?.length ? (
            <div className="divide-y divide-border">
              {recentPayments.map((p) => (
                <div key={p.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">
                      {p.flat_id ? recentFlatMap.get(p.flat_id) ?? "—" : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.payment_date ? formatDate(p.payment_date) : "—"} ·{" "}
                      {p.payment_mode} · {p.receipt_no}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(Number(p.amount))}</div>
                    <div className="text-xs text-muted-foreground">{p.category}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No payments yet.</p>
          )}
        </div>

        <div className="card-soft">
          <div className="flex items-center justify-between mb-3">
            <h3>
              <AlertTriangle className="inline w-5 h-5 mr-1 text-destructive" />
              Defaulters
            </h3>
            <span className="text-xs text-muted-foreground">
              {cutoff}+ months unpaid
            </span>
          </div>
          {defaulters.length ? (
            <div className="divide-y divide-border">
              {defaulters.map((d) => (
                <div key={d.id} className="py-3 flex items-center justify-between">
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
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No defaulters. Nicely done.</p>
          )}
        </div>
      </div>

      <div className="card-soft">
        <h3 className="mb-3">Quick actions</h3>
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
  accent,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  accent?: "success" | "warning" | "destructive";
}) {
  const accentCls =
    accent === "success"
      ? "text-[hsl(151_70%_28%)]"
      : accent === "warning"
      ? "text-[hsl(38_95%_35%)]"
      : accent === "destructive"
      ? "text-destructive"
      : "";
  return (
    <div className="card-soft">
      <div className="text-sm text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${accentCls}`}>{value}</div>
    </div>
  );
}
