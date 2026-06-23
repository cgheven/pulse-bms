import Link from "next/link";
import { Suspense } from "react";
import {
  Target,
  CalendarClock,
  AlertTriangle,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { formatRelative, cn } from "@/lib/utils";
import { TableSkeleton, KpiRowSkeleton } from "@/components/layout/table-skeleton";
import { LeadsFilters } from "@/components/leads/leads-filters";
import { AddLeadButton } from "@/components/leads/lead-form-dialog";
import { LeadRowDelete } from "@/components/leads/lead-row-delete";
import { LeadRowFollowup } from "@/components/leads/lead-row-followup";
import { LeadRowInterest } from "@/components/leads/lead-row-interest";
import { SendDemoButton } from "@/components/leads/send-demo-button";
import { SetTargetsButton } from "@/components/leads/set-targets-dialog";
import { getSalesTargets } from "@/app/actions/sales-targets";
import { SendFollowupDigestButton } from "@/components/leads/send-followup-digest-button";
import type {
  LeadStatus,
  LeadRole,
  LeadSource,
  LeadTemperature,
} from "@/app/actions/leads";

export const dynamic = "force-dynamic";

type LeadRow = {
  id: string;
  building_name: string;
  area: string | null;
  city: string | null;
  flat_count_estimate: number | null;
  contact_name: string;
  contact_role: LeadRole;
  whatsapp_number: string;
  status: LeadStatus;
  source: LeadSource;
  /** DB column `temperature` — surfaced to user as Interest level. */
  temperature: LeadTemperature;
  next_followup_date: string | null;
  created_at: string;
  updated_at: string;
};

const SOURCE_LABEL: Record<LeadSource, string> = {
  cold_visit: "Cold visit",
  referral: "Referral",
  whatsapp_inbound: "WhatsApp",
  event: "Event",
  other: "Other",
  website: "Website",
};

const ROLE_LABEL: Record<LeadRole, string> = {
  president: "President",
  treasurer: "Treasurer",
  secretary: "Secretary",
  member: "Member",
  admin: "Admin",
  other: "Contact",
};

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  demo_done: "Demo Done",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
  dormant: "Dormant",
};

// Tailwind class per status pill — mirrors the .status-* utilities used
// elsewhere but inlined so we can lean on the existing colour palette.
const STATUS_PILL: Record<LeadStatus, string> = {
  new: "bg-secondary text-foreground",
  contacted: "bg-info/15 text-info",
  demo_done: "bg-primary/15 text-primary",
  negotiating: "bg-warning/15 text-warning",
  won: "bg-success/15 text-success",
  lost: "bg-destructive/15 text-destructive",
  dormant: "bg-muted text-muted-foreground",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function startOfWeekIso(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

type SP = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const { profile, user } = await requireRole(["super_admin", "sales"]);
  const ownerName = profile.full_name || user.email || "Pulse BMS";
  const sp = await searchParams;

  const status = typeof sp.status === "string" ? sp.status : "";
  // Two independent date filters. dueToday and overdue are mutually
  // exclusive at the UI layer; if a stale URL has both set, dueToday
  // wins (it's the more specific filter).
  const dueToday = sp.dueToday === "1";
  const overdue = !dueToday && sp.overdue === "1";
  const q = typeof sp.q === "string" ? sp.q : "";
  // Date range filter on created_at (YYYY-MM-DD strings).
  const dateFrom = typeof sp.dateFrom === "string" ? sp.dateFrom : "";
  const dateTo = typeof sp.dateTo === "string" ? sp.dateTo : "";

  return (
    <div className="space-y-5 animate-fade-up min-w-0 w-full">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Prospect societies — track every conversation from cold visit to
            closed deal.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {profile.role === "super_admin" && <SendFollowupDigestButton />}
          <AddLeadButton ownerName={ownerName} />
        </div>
      </div>

      <Suspense fallback={<KpiRowSkeleton count={4} />}>
        <LeadsKpis />
      </Suspense>

      <Suspense fallback={<KpiRowSkeleton count={3} />}>
        <LeadsTargetProgress isSuperAdmin={profile.role === "super_admin"} />
      </Suspense>

      <LeadsFilters
        status={status}
        overdue={overdue}
        dueToday={dueToday}
        q={q}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <LeadsTable
          status={status}
          overdue={overdue}
          dueToday={dueToday}
          q={q}
          dateFrom={dateFrom}
          dateTo={dateTo}
          ownerName={ownerName}
        />
      </Suspense>
    </div>
  );
}

async function LeadsTargetProgress({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const supabase = await createClient();
  const today = todayIso();
  const weekStart = startOfWeekIso();
  const monthStart = startOfMonthIso();
  const targets = await getSalesTargets();

  const [dayRes, weekRes, monthRes] = await Promise.all([
    supabase
      .from("bms_leads")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .gte("created_at", `${today}T00:00:00`),
    supabase
      .from("bms_leads")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .gte("created_at", weekStart),
    supabase
      .from("bms_leads")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .gte("created_at", monthStart),
  ]);

  const dayCount = dayRes.count ?? 0;
  const weekCount = weekRes.count ?? 0;
  const monthCount = monthRes.count ?? 0;

  const periods = [
    { label: "Today", count: dayCount, target: targets.daily_target },
    { label: "This Week", count: weekCount, target: targets.weekly_target },
    { label: "This Month", count: monthCount, target: targets.monthly_target },
  ];

  const hasAnyTarget = periods.some((p) => p.target != null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <TrendingUp className="w-4 h-4 text-primary" />
          Leads Added
        </div>
        {isSuperAdmin && <SetTargetsButton current={targets} />}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {periods.map(({ label, count, target }) => {
          const pct = target ? Math.min(100, Math.round((count / target) * 100)) : null;
          const met = target != null && count >= target;
          const behind = target != null && pct != null && pct < 50;
          const close = target != null && pct != null && pct >= 50 && !met;
          return (
            <div key={label} className="rounded-lg border border-border bg-card p-4 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <div className="flex items-end gap-1.5">
                <span className={cn(
                  "text-3xl font-semibold tabular-nums",
                  met ? "text-success" : behind ? "text-destructive" : close ? "text-warning" : "text-foreground",
                )}>
                  {count}
                </span>
                {target != null && (
                  <span className="text-sm text-muted-foreground mb-0.5">/ {target}</span>
                )}
              </div>
              {target != null && pct != null ? (
                <div className="space-y-1">
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        met ? "bg-success" : behind ? "bg-destructive" : "bg-warning",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className={cn(
                    "text-[11px] font-medium",
                    met ? "text-success" : behind ? "text-destructive" : "text-warning",
                  )}>
                    {met ? "Target met ✓" : `${pct}% — ${target - count} to go`}
                  </p>
                </div>
              ) : !hasAnyTarget && isSuperAdmin ? (
                <p className="text-[11px] text-muted-foreground">No target set</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function LeadsKpis() {
  const supabase = await createClient();
  const today = todayIso();
  const monthStart = startOfMonthIso();

  const [activeRes, dueTodayRes, overdueRes, wonMonthRes] = await Promise.all([
    // "Active" = not won/lost/dormant and not archived
    supabase
      .from("bms_leads")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .not("status", "in", "(won,lost,dormant)"),
    supabase
      .from("bms_leads")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .eq("next_followup_date", today)
      .not("status", "in", "(won,lost)"),
    supabase
      .from("bms_leads")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .lt("next_followup_date", today)
      .not("next_followup_date", "is", null)
      .not("status", "in", "(won,lost)"),
    // "Won this month": use won_at (the moment the lead transitioned to
    // won) instead of updated_at — otherwise editing notes on an old won
    // deal would silently re-count it. won_at is null for non-won leads.
    supabase
      .from("bms_leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "won")
      .not("won_at", "is", null)
      .gte("won_at", monthStart),
  ]);

  const active = activeRes.count ?? 0;
  const dueToday = dueTodayRes.count ?? 0;
  const overdueCount = overdueRes.count ?? 0;
  const wonMonth = wonMonthRes.count ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Kpi
        label="Active leads"
        value={String(active)}
        icon={Target}
        href="/super-admin/leads"
      />
      <Kpi
        label="Due today"
        value={String(dueToday)}
        icon={CalendarClock}
        href="/super-admin/leads?dueToday=1"
        warn={dueToday > 0}
      />
      <Kpi
        label="Overdue"
        value={String(overdueCount)}
        icon={AlertTriangle}
        href="/super-admin/leads?overdue=1"
        danger={overdueCount > 0}
      />
      <Kpi
        label="Won this month"
        value={String(wonMonth)}
        icon={Trophy}
        href="/super-admin/leads?status=won"
        success={wonMonth > 0}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  href,
  danger,
  warn,
  success,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  danger?: boolean;
  warn?: boolean;
  success?: boolean;
}) {
  return (
    <Link
      href={href}
      className="card-hover rounded-lg border border-border bg-card p-4 block"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div
          className={cn(
            "flex w-8 h-8 items-center justify-center rounded-md shrink-0",
            danger
              ? "bg-destructive/15 text-destructive"
              : warn
              ? "bg-warning/15 text-warning"
              : success
              ? "bg-success/15 text-success"
              : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div
        className={cn(
          "mt-1.5 text-3xl font-semibold tracking-tight tabular-nums",
          danger ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </div>
    </Link>
  );
}

async function LeadsTable({
  status,
  overdue,
  dueToday,
  q,
  dateFrom,
  dateTo,
  ownerName,
}: {
  status: string;
  overdue: boolean;
  dueToday: boolean;
  q: string;
  dateFrom: string;
  dateTo: string;
  ownerName: string;
}) {
  const supabase = await createClient();
  const today = todayIso();

  let query = supabase
    .from("bms_leads")
    .select(
      "id, building_name, area, city, flat_count_estimate, contact_name, contact_role, whatsapp_number, status, source, temperature, next_followup_date, created_at, updated_at",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }
  // dueToday takes precedence over overdue (mutually exclusive — set in
  // the page loader). dueToday = follow-up scheduled for today on an
  // open lead.
  if (dueToday) {
    query = query
      .eq("next_followup_date", today)
      .not("status", "in", "(won,lost)");
  } else if (overdue) {
    query = query
      .lt("next_followup_date", today)
      .not("next_followup_date", "is", null)
      .not("status", "in", "(won,lost)");
  }
  if (q) {
    // Supabase .or() — ILIKE across the three searchable text columns.
    const safe = q.replace(/[%,]/g, " ").trim();
    if (safe) {
      query = query.or(
        `building_name.ilike.%${safe}%,contact_name.ilike.%${safe}%,area.ilike.%${safe}%`,
      );
    }
  }
  if (dateFrom) {
    query = query.gte("created_at", `${dateFrom}T00:00:00`);
  }
  if (dateTo) {
    query = query.lte("created_at", `${dateTo}T23:59:59`);
  }

  const { data, error } = await query;
  const leads = (data ?? []) as LeadRow[];

  // Per-row last activity timestamp (for the "last activity" column).
  // Bulk-fetch instead of N+1 by querying max(created_at) per lead in one shot.
  const lastByLead: Record<string, string> = {};
  if (leads.length > 0) {
    const { data: activityMaxes } = await supabase
      .from("bms_lead_activities")
      .select("lead_id, created_at")
      .in(
        "lead_id",
        leads.map((l) => l.id),
      )
      .order("created_at", { ascending: false });
    for (const row of activityMaxes ?? []) {
      // Keep the first (max) per lead_id since the list is sorted desc.
      const r = row as { lead_id: string; created_at: string };
      if (!lastByLead[r.lead_id]) lastByLead[r.lead_id] = r.created_at;
    }
  }

  if (error) {
    return (
      <div className="card-soft border-destructive/40 bg-destructive/5 text-destructive">
        Could not load leads. Please refresh — if it keeps failing, contact
        support.
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="card-soft text-center py-12">
        <Target className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="text-lg font-semibold">No leads yet</h3>
        <p className="text-muted-foreground mt-1">
          Start by adding a society you&rsquo;ve visited or someone who reached
          out on WhatsApp.
        </p>
        <div className="mt-4 inline-block">
          <AddLeadButton ownerName={ownerName} />
        </div>
      </div>
    );
  }

  return (
    <div className="card-soft p-0 overflow-hidden w-full max-w-full">
      <div className="overflow-x-auto w-full">
        <table className="w-full min-w-[820px]">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="px-4 py-3 text-sm font-semibold">Building</th>
              <th className="px-4 py-3 text-sm font-semibold">Area</th>
              <th className="px-4 py-3 text-sm font-semibold text-right">Flats</th>
              <th className="px-4 py-3 text-sm font-semibold">Contact</th>
              <th className="px-4 py-3 text-sm font-semibold">WhatsApp</th>
              <th className="px-4 py-3 text-sm font-semibold">Status</th>
              <th className="px-4 py-3 text-sm font-semibold">Interest</th>
              <th className="px-4 py-3 text-sm font-semibold">Next follow-up</th>
              <th className="px-4 py-3 text-sm font-semibold">Last activity</th>
              <th className="px-4 py-3 text-sm font-semibold w-12 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const isOverdue =
                l.next_followup_date != null &&
                l.next_followup_date < today &&
                l.status !== "won" &&
                l.status !== "lost";
              const lastAt = lastByLead[l.id];
              return (
                <tr
                  key={l.id}
                  className="border-t border-border hover:bg-secondary/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/super-admin/leads/${l.id}`}
                      className="font-semibold text-foreground hover:text-primary"
                    >
                      {l.building_name}
                    </Link>
                    {l.source === "website" && (
                      <div className="mt-1">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/30">
                          <span className="w-1 h-1 rounded-full bg-primary" />
                          From Website
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {[l.area, l.city].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {l.flat_count_estimate ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm">{l.contact_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {ROLE_LABEL[l.contact_role]}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <SendDemoButton
                      leadId={l.id}
                      phone={l.whatsapp_number}
                      contactName={l.contact_name}
                      ownerName={ownerName}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex px-2.5 py-0.5 text-xs rounded-full font-medium",
                        STATUS_PILL[l.status],
                      )}
                    >
                      {STATUS_LABEL[l.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <LeadRowInterest leadId={l.id} value={l.temperature} />
                  </td>
                  <td className="px-4 py-3">
                    <LeadRowFollowup
                      leadId={l.id}
                      value={l.next_followup_date}
                      isOverdue={isOverdue}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {lastAt ? formatRelative(lastAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <LeadRowDelete
                      leadId={l.id}
                      buildingName={l.building_name}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

