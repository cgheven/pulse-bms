import Link from "next/link";
import { Suspense } from "react";
import {
  Target,
  CalendarClock,
  AlertTriangle,
  Trophy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { formatRelative, formatDate, cn } from "@/lib/utils";
import { TableSkeleton, KpiRowSkeleton } from "@/components/layout/table-skeleton";
import { LeadsFilters } from "@/components/leads/leads-filters";
import { AddLeadButton } from "@/components/leads/lead-form-dialog";
import { LeadRowDelete } from "@/components/leads/lead-row-delete";
import { SendDemoButton } from "@/components/leads/send-demo-button";
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

// Interest pill — sales rep's read on conversion likelihood after
// contacting the lead. Mirrors DB `temperature` (hot/warm/cold) with
// user-facing High/Medium/Low labels.
const INTEREST_PILL: Record<
  LeadTemperature,
  { label: string; emoji: string; cls: string }
> = {
  hot: {
    label: "High",
    emoji: "🔥",
    cls: "bg-destructive/15 text-destructive border border-destructive/30",
  },
  warm: {
    label: "Medium",
    emoji: "🌡️",
    cls: "bg-warning/15 text-warning border border-warning/30",
  },
  cold: {
    label: "Low",
    emoji: "❄️",
    cls: "bg-info/15 text-info border border-info/30",
  },
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

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Prospect societies — track every conversation from cold visit to
            closed deal.
          </p>
        </div>
        <AddLeadButton ownerName={ownerName} />
      </div>

      <Suspense fallback={<KpiRowSkeleton count={4} />}>
        <LeadsKpis />
      </Suspense>

      <LeadsFilters
        status={status}
        overdue={overdue}
        dueToday={dueToday}
        q={q}
      />

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <LeadsTable
          status={status}
          overdue={overdue}
          dueToday={dueToday}
          q={q}
          ownerName={ownerName}
        />
      </Suspense>
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
  ownerName,
}: {
  status: string;
  overdue: boolean;
  dueToday: boolean;
  q: string;
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
    <div className="card-soft p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
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
                    {(() => {
                      const p = INTEREST_PILL[l.temperature];
                      return (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-semibold",
                            p.cls,
                          )}
                          title={`Interest: ${p.label}`}
                        >
                          <span aria-hidden>{p.emoji}</span>
                          {p.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {l.next_followup_date ? (
                      <span
                        className={cn(
                          "text-sm tabular-nums",
                          isOverdue && "text-destructive font-semibold",
                        )}
                      >
                        {formatDate(l.next_followup_date)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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

