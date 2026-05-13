import Link from "next/link";
import { Building2, Users, Wallet, AlertTriangle, FileText, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { formatLakh, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function startOfPrevMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}
function startOfThisMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default async function SuperAdminDashboard() {
  await requireRole("super_admin");
  const supabase = await createClient();

  // KPI queries — in parallel
  const [
    activeBuildingsRes,
    flatsRes,
    residentsRes,
    fundsRes,
    duesRes,
    invoicesLastMonthRes,
    recentAuditRes,
  ] = await Promise.all([
    supabase
      .from("bms_buildings")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase.from("bms_flats").select("id", { count: "exact", head: true }),
    supabase
      .from("bms_residents")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase.from("bms_buildings").select("fund_balance").eq("is_active", true),
    supabase.from("bms_flats").select("outstanding_dues"),
    supabase
      .from("bms_invoices")
      .select("amount")
      .gte("billing_month", startOfPrevMonth().toISOString().slice(0, 10))
      .lt("billing_month", startOfThisMonth().toISOString().slice(0, 10)),
    supabase
      .from("bms_audit_log")
      .select("id, created_at, actor_email, actor_role, action, entity, entity_id")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const totalBuildings = activeBuildingsRes.count ?? 0;
  const totalFlats = flatsRes.count ?? 0;
  const totalResidents = residentsRes.count ?? 0;

  const totalFunds =
    (fundsRes.data ?? []).reduce(
      (sum, b: { fund_balance: number | null }) => sum + Number(b.fund_balance ?? 0),
      0
    );

  const totalDues =
    (duesRes.data ?? []).reduce(
      (sum, f: { outstanding_dues: number | null }) => sum + Number(f.outstanding_dues ?? 0),
      0
    );

  const totalBilledLastMonth =
    (invoicesLastMonthRes.data ?? []).reduce(
      (sum, i: { amount: number | null }) => sum + Number(i.amount ?? 0),
      0
    );

  const recent = recentAuditRes.data ?? [];

  const monthLabel = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>Super Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Cross-building overview · {monthLabel}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/super-admin/buildings"
            className="btn-big bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center"
          >
            Manage Buildings
          </Link>
        </div>
      </div>

      {/* Hero card — fund balance + flats + residents */}
      <div className="card-hover glow-amber rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8 animate-count-up">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Fund Balance
            </p>
            <p className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight text-primary">
              {formatLakh(totalFunds)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Across {totalBuildings} active building{totalBuildings === 1 ? "" : "s"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:col-span-2">
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Flats</span>
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div className="text-3xl font-bold mt-2">{totalFlats}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Residents</span>
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="text-3xl font-bold mt-2">{totalResidents}</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-up animate-delay-150">
        <Kpi
          label="Active Buildings"
          value={totalBuildings.toString()}
          icon={Building2}
          href="/super-admin/buildings"
        />
        <Kpi
          label="Total Flats"
          value={totalFlats.toString()}
          icon={FileText}
          href="/super-admin/buildings"
        />
        <Kpi
          label="Total Residents"
          value={totalResidents.toString()}
          icon={Users}
          href="/super-admin/buildings"
        />
        <Kpi
          label="Outstanding Dues"
          value={formatLakh(totalDues)}
          icon={AlertTriangle}
          href="/super-admin/buildings"
          danger={totalDues > 0}
        />
        <Kpi
          label="Billed Last Month"
          value={formatLakh(totalBilledLastMonth)}
          icon={Receipt}
          href="/super-admin/audit"
        />
        <Kpi
          label="Fund Balance"
          value={formatLakh(totalFunds)}
          icon={Wallet}
          href="/super-admin/buildings"
        />
      </div>

      {/* Recent activity */}
      <div className="card-soft animate-fade-up animate-delay-300">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
          <h2 className="text-xl font-semibold">Recent Activity</h2>
          <Link href="/super-admin/audit" className="text-primary text-sm font-medium hover:underline">
            View full audit log →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">No activity yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-medium text-xs uppercase tracking-wider">When</th>
                  <th className="py-2 pr-4 font-medium text-xs uppercase tracking-wider">Actor</th>
                  <th className="py-2 pr-4 font-medium text-xs uppercase tracking-wider">Action</th>
                  <th className="py-2 pr-4 font-medium text-xs uppercase tracking-wider">Entity</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r: { id: number; created_at: string; actor_email: string | null; actor_role: string | null; action: string; entity: string; entity_id: string | null }) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">{formatDate(r.created_at)}</td>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{r.actor_email ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.actor_role ?? ""}</div>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-primary">{r.action}</td>
                    <td className="py-3 pr-4">{r.entity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  href,
  danger,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  danger?: boolean;
}) {
  return (
    <Link
      href={href}
      className="card-hover rounded-xl border border-border bg-card p-5 block"
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="flex w-10 h-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div
        className={`mt-2 text-3xl font-bold tracking-tight ${
          danger ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </Link>
  );
}
