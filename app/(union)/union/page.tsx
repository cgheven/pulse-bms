import Link from "next/link";
import { Vote, CalendarDays, Rocket, FileText, AlertTriangle, Users2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProposeButton } from "@/components/union/propose-button";
import { formatCurrency, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function UnionDashboardPage() {
  const { profile } = await requireRole("union");
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Union dashboard</h1>
        <p className="text-muted-foreground mt-2">No building assigned to your account.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const building_id = profile.building_id;
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  // Building name for header context
  const { data: building } = await supabase
    .from("bms_buildings")
    .select("name")
    .eq("id", building_id)
    .maybeSingle();

  // Pending proposals
  const { count: pendingCount } = await supabase
    .from("bms_proposals")
    .select("id", { count: "exact", head: true })
    .eq("building_id", building_id)
    .eq("status", "pending");

  // My pending votes — pending proposals where I haven't voted
  const { data: um } = await supabase
    .from("bms_union_members")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("building_id", building_id)
    .eq("is_active", true)
    .maybeSingle();

  let myPendingVotes = 0;
  if (um?.id) {
    const { data: pendingProps } = await supabase
      .from("bms_proposals")
      .select("id")
      .eq("building_id", building_id)
      .eq("status", "pending");
    const propIds = (pendingProps ?? []).map((p) => p.id);
    if (propIds.length > 0) {
      const { data: myVotes } = await supabase
        .from("bms_proposal_votes")
        .select("proposal_id")
        .eq("union_member_id", um.id)
        .in("proposal_id", propIds);
      const votedIds = new Set((myVotes ?? []).map((v) => v.proposal_id));
      myPendingVotes = propIds.filter((id) => !votedIds.has(id)).length;
    }
  }

  // Meetings this month
  const { count: meetingsCount } = await supabase
    .from("bms_meetings")
    .select("id", { count: "exact", head: true })
    .eq("building_id", building_id)
    .gte("scheduled_at", startMonth)
    .lt("scheduled_at", endMonth);

  // Recent executions (last 30 days)
  const thirtyAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const { count: executedCount } = await supabase
    .from("bms_proposals")
    .select("id", { count: "exact", head: true })
    .eq("building_id", building_id)
    .eq("status", "executed")
    .gte("executed_at", thirtyAgo);

  // Recent proposals (top 5)
  const { data: recent } = await supabase
    .from("bms_proposals")
    .select("id, title, status, amount, proposal_type, created_at")
    .eq("building_id", building_id)
    .order("created_at", { ascending: false })
    .limit(5);

  // Upcoming meetings
  const { data: upcoming } = await supabase
    .from("bms_meetings")
    .select("id, title, scheduled_at, location")
    .eq("building_id", building_id)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(3);

  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function statusPillClass(status: string | null) {
    switch (status) {
      case "executed":
      case "approved":
        return "status-paid";
      case "pending":
        return "status-pending";
      case "rejected":
      case "cancelled":
        return "status-overdue";
      default:
        return "status-info";
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>Union Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {building?.name ?? "Your building"} · {monthLabel}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <ProposeButton
            proposal_type="expense"
            buttonLabel="Propose expense"
            dialogTitle="Propose a new expense"
            dialogDescription="Describe the expense; members will vote before it is recorded."
            showAmount
          />
          <ProposeButton
            proposal_type="repair"
            buttonLabel="Propose repair"
            dialogTitle="Propose a repair"
            dialogDescription="What needs fixing? Add the cost estimate if known."
            showAmount
            variant="outline"
            className=""
          />
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Vote className="w-5 h-5" />}
          label="My pending votes"
          value={String(myPendingVotes)}
          href="/union/proposals"
          attention={myPendingVotes > 0}
        />
        <KpiCard
          icon={<FileText className="w-5 h-5" />}
          label="Pending proposals"
          value={String(pendingCount ?? 0)}
          href="/union/proposals"
        />
        <KpiCard
          icon={<CalendarDays className="w-5 h-5" />}
          label="Meetings this month"
          value={String(meetingsCount ?? 0)}
          href="/union/meetings"
        />
        <KpiCard
          icon={<Rocket className="w-5 h-5" />}
          label="Executed (30 days)"
          value={String(executedCount ?? 0)}
          href="/union/proposals"
        />
      </div>

      {/* Two-column: proposals + meetings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up animate-delay-150">
        {/* Recent proposals */}
        <div className="card-soft card-hover">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <h2 className="text-xl font-semibold">Recent proposals</h2>
            <Link href="/union/proposals" className="text-primary text-sm font-medium hover:underline">
              View all →
            </Link>
          </div>
          {(recent ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No proposals yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(recent ?? []).map((p) => (
                <li key={p.id} className="py-3">
                  <Link href={`/union/proposals/${p.id}`} className="flex items-center justify-between gap-3 group">
                    <div className="min-w-0">
                      <div className="font-medium truncate group-hover:text-primary transition-colors">
                        {p.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {p.proposal_type} · {formatDate(p.created_at)}
                        {p.amount ? ` · ${formatCurrency(Number(p.amount))}` : ""}
                      </div>
                    </div>
                    <span className={`${statusPillClass(p.status)} inline-flex px-2.5 py-0.5 rounded-full text-xs uppercase font-semibold tracking-wide`}>
                      {p.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upcoming meetings */}
        <div className="card-soft card-hover">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <h2 className="text-xl font-semibold">Upcoming meetings</h2>
            <Link href="/union/meetings" className="text-primary text-sm font-medium hover:underline">
              View all →
            </Link>
          </div>
          {(upcoming ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No upcoming meetings scheduled.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(upcoming ?? []).map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex w-10 h-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      <Users2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium">{m.title}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {formatDate(m.scheduled_at)} ·{" "}
                        {new Date(m.scheduled_at).toLocaleTimeString("en-PK", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {m.location ? ` · ${m.location}` : ""}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!um && (
        <div className="card-soft border-primary/40 bg-primary/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-primary mt-1 shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">You are not an active union member</h3>
              <p className="text-muted-foreground mt-1">
                Ask your building admin to add you to the union committee so you can vote on proposals.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  href,
  attention,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
  attention?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`card-hover rounded-xl border bg-card p-5 block ${
        attention ? "border-primary/40 glow-amber animate-pulse-glow" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div
          className={`flex w-10 h-10 items-center justify-center rounded-lg ${
            attention ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"
          }`}
        >
          {icon}
        </div>
      </div>
      <div
        className={`mt-2 text-3xl font-bold tracking-tight ${
          attention ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </Link>
  );
}
