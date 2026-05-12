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

  const cards = [
    { label: "Active Buildings", value: totalBuildings.toString(), icon: Building2, href: "/super-admin/buildings" },
    { label: "Total Flats", value: totalFlats.toString(), icon: FileText, href: "/super-admin/buildings" },
    { label: "Total Residents", value: totalResidents.toString(), icon: Users, href: "/super-admin/buildings" },
    { label: "Total Fund Balance", value: formatLakh(totalFunds), icon: Wallet, href: "/super-admin/buildings" },
    { label: "Outstanding Dues", value: formatLakh(totalDues), icon: AlertTriangle, href: "/super-admin/buildings", danger: totalDues > 0 },
    { label: "Billed Last Month", value: formatLakh(totalBilledLastMonth), icon: Receipt, href: "/super-admin/audit" },
  ];

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1>Super Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Cross-building overview, admin assignments, and audit history.
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card-soft hover:shadow-md transition-shadow block">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium text-muted-foreground">{c.label}</div>
                <div
                  className={`mt-2 text-3xl font-bold tracking-tight ${
                    c.danger ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {c.value}
                </div>
              </div>
              <div className="rounded-lg bg-secondary p-3 text-primary">
                <c.icon className="w-6 h-6" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="card-soft">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Activity</h2>
          <Link href="/super-admin/audit" className="text-primary text-sm font-medium hover:underline">
            View full audit log
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">No activity yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Actor</th>
                  <th className="py-2 pr-4 font-medium">Action</th>
                  <th className="py-2 pr-4 font-medium">Entity</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r: { id: number; created_at: string; actor_email: string | null; actor_role: string | null; action: string; entity: string; entity_id: string | null }) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="py-2 pr-4">
                      <div className="font-medium">{r.actor_email ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.actor_role ?? ""}</div>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.action}</td>
                    <td className="py-2 pr-4">{r.entity}</td>
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
