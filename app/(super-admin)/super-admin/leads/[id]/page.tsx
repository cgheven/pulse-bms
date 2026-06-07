import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  User,
  Hash,
  Calendar,
  Coins,
  Clock,
  Flame,
  StickyNote,
  PhoneCall,
  MessageCircle,
  Video,
  Handshake,
  Quote,
  GitBranch,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import {
  formatCurrency,
  formatDate,
  formatRelative,
  cn,
} from "@/lib/utils";
import { displayPkPhone } from "@/lib/pk-phone";
import { WhatsappButton } from "@/components/leads/whatsapp-button";
import { LeadDetailActions } from "@/components/leads/lead-detail-actions";
import { LogFollowupForm } from "@/components/leads/log-followup-form";
import { NotesCard } from "@/components/leads/notes-card";
import type {
  LeadStatus,
  LeadTemperature,
  LeadRole,
  LeadSource,
  ActivityType,
  FollowupChannel,
} from "@/app/actions/leads";

export const dynamic = "force-dynamic";

type Lead = {
  id: string;
  building_name: string;
  area: string | null;
  city: string | null;
  flat_count_estimate: number | null;
  contact_name: string;
  contact_role: LeadRole;
  whatsapp_number: string;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  temperature: LeadTemperature;
  next_followup_date: string | null;
  quoted_amount: number | null;
  maintenance_per_flat: number | null;
  notes: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

type Activity = {
  id: string;
  lead_id: string;
  activity_type: ActivityType;
  note: string | null;
  meta: Record<string, unknown> | null;
  followup_due_date: string | null;
  actor_id: string | null;
  created_at: string;
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

const STATUS_PILL: Record<LeadStatus, string> = {
  new: "bg-secondary text-foreground",
  contacted: "bg-info/15 text-info",
  demo_done: "bg-primary/15 text-primary",
  negotiating: "bg-warning/15 text-warning",
  won: "bg-success/15 text-success",
  lost: "bg-destructive/15 text-destructive",
  dormant: "bg-muted text-muted-foreground",
};

const ROLE_LABEL: Record<LeadRole, string> = {
  president: "President",
  treasurer: "Treasurer",
  secretary: "Secretary",
  member: "Committee member",
  admin: "Admin / Manager",
  other: "Contact",
};

const SOURCE_LABEL: Record<LeadSource, string> = {
  cold_visit: "Cold visit",
  referral: "Referral",
  whatsapp_inbound: "WhatsApp inbound",
  event: "Event / expo",
  other: "Other",
  website: "Website (onboarding form)",
};

const TEMP_EMOJI: Record<LeadTemperature, string> = {
  hot: "🔥 Hot",
  warm: "🌡️ Warm",
  cold: "❄️ Cold",
};

const ACTIVITY_ICON: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  call: PhoneCall,
  whatsapp_sent: MessageCircle,
  whatsapp_received: MessageCircle,
  meeting: Handshake,
  demo: Video,
  quote_sent: Quote,
  status_change: GitBranch,
};

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  note: "Note",
  call: "Call",
  whatsapp_sent: "WhatsApp sent",
  whatsapp_received: "WhatsApp received",
  meeting: "Meeting",
  demo: "Demo",
  quote_sent: "Quote sent",
  status_change: "Status changed",
};

// When an activity was logged via the structured "Log a Follow-up" form
// it carries a `meta.channel` value (one of the 5 channels). The channel
// pill rendered next to the activity title uses these labels + icons so
// the timeline reads at a glance.
const CHANNEL_LABEL: Record<FollowupChannel, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  meeting: "Meeting",
  demo: "Demo",
  other: "Other",
};

const CHANNEL_ICON: Record<FollowupChannel, React.ComponentType<{ className?: string }>> = {
  call: PhoneCall,
  whatsapp: MessageCircle,
  meeting: Handshake,
  demo: Video,
  other: StickyNote,
};

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile, user } = await requireRole(["super_admin", "sales"]);
  const { id } = await params;

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("bms_leads")
    .select(
      "id, building_name, area, city, flat_count_estimate, contact_name, contact_role, whatsapp_number, email, source, status, temperature, next_followup_date, quoted_amount, maintenance_per_flat, notes, owner_id, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!lead) return notFound();

  const l = lead as Lead;

  const { data: activities } = await supabase
    .from("bms_lead_activities")
    .select(
      "id, lead_id, activity_type, note, meta, followup_due_date, actor_id, created_at",
    )
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(200);

  // Compute days-in-status from the most recent status_change activity,
  // falling back to lead.created_at when the lead has never changed
  // status (i.e. still in "new").
  const lastStatusChange = (activities ?? []).find(
    (a) => a.activity_type === "status_change",
  );
  const daysInStatus = daysSince(lastStatusChange?.created_at ?? l.created_at);

  // Owner display name (created-by) — admin client because bms_profiles
  // requires elevated reads for non-self rows.
  let createdBy = "—";
  if (l.owner_id) {
    const admin = createAdminClient();
    const { data: owner } = await admin
      .from("bms_profiles")
      .select("full_name, email")
      .eq("id", l.owner_id)
      .maybeSingle();
    createdBy = owner?.full_name || owner?.email || "—";
  }

  // Resolve actor display names in one shot for the activity timeline.
  const actorIds = Array.from(
    new Set((activities ?? []).map((a) => a.actor_id).filter(Boolean) as string[]),
  );
  const actorNames: Record<string, string> = {};
  if (actorIds.length > 0) {
    const admin = createAdminClient();
    const { data: actors } = await admin
      .from("bms_profiles")
      .select("id, full_name, email")
      .in("id", actorIds);
    for (const a of actors ?? []) {
      actorNames[a.id] = a.full_name || a.email || "—";
    }
  }

  // Owner name for WhatsApp template pre-fill — defaults to the
  // currently-logged-in super admin since they're the one reaching out.
  const ownerName = profile.full_name || user.email || "Pulse BMS";

  // Pre-shape lead for edit dialog (strings instead of numbers/nulls).
  // next_followup_date intentionally omitted — see LeadFormValues. The
  // Edit Lead dialog no longer renders that field; follow-ups are owned
  // by the activity timeline.
  const editInitial = {
    id: l.id,
    building_name: l.building_name,
    area: l.area ?? "",
    city: l.city ?? "Karachi",
    flat_count_estimate:
      l.flat_count_estimate == null ? "" : String(l.flat_count_estimate),
    contact_name: l.contact_name,
    contact_role: l.contact_role,
    whatsapp_number: l.whatsapp_number,
    email: l.email ?? "",
    source: l.source,
    status: l.status,
    // Form surfaces the DB `temperature` column as "Interest level".
    interest: l.temperature,
    quoted_amount: l.quoted_amount == null ? "" : String(l.quoted_amount),
    maintenance_per_flat:
      l.maintenance_per_flat == null ? "" : String(l.maintenance_per_flat),
    notes: l.notes ?? "",
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <Link
        href="/super-admin/leads"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to leads
      </Link>

      {/* Hero */}
      <div className="card-soft">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">{l.building_name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex px-3 py-1 text-sm rounded-full font-medium",
                  STATUS_PILL[l.status],
                )}
              >
                {STATUS_LABEL[l.status]}
              </span>
              <span className="text-base">{TEMP_EMOJI[l.temperature]}</span>
              {l.flat_count_estimate != null && (
                <span className="text-sm text-muted-foreground">
                  · {l.flat_count_estimate} flats (est.)
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <WhatsappButton
            leadId={l.id}
            phone={l.whatsapp_number}
            contactName={l.contact_name}
            ownerName={ownerName}
          />
          <LeadDetailActions
            lead={{ ...editInitial, status: l.status }}
            phone={l.whatsapp_number}
          />
        </div>
      </div>

      {/* Body grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">
          <ContactCard
            lead={l}
            createdBy={createdBy}
          />
          <PipelineCard lead={l} daysInStatus={daysInStatus} />
          <NotesCard leadId={l.id} notes={l.notes} />
        </div>

        {/* Right column */}
        <div className="lg:col-span-3 space-y-4">
          <h2 className="text-lg font-semibold">Activity</h2>
          <LogFollowupForm leadId={l.id} />
          <ActivityTimeline
            activities={(activities ?? []) as Activity[]}
            actorNames={actorNames}
          />
        </div>
      </div>
    </div>
  );
}

function ContactCard({
  lead,
  createdBy,
}: {
  lead: Lead;
  createdBy: string;
}) {
  return (
    <div className="card-soft space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Contact
      </h3>
      <Row icon={User}>
        <div>
          <div className="font-medium">{lead.contact_name}</div>
          <div className="text-xs text-muted-foreground">
            {ROLE_LABEL[lead.contact_role]}
          </div>
        </div>
      </Row>
      <Row icon={Phone}>
        <a
          href={`tel:+${lead.whatsapp_number.replace(/\D/g, "")}`}
          className="hover:underline"
        >
          {displayPkPhone(lead.whatsapp_number)}
        </a>
      </Row>
      {lead.email && (
        <Row icon={Mail}>
          <a href={`mailto:${lead.email}`} className="hover:underline">
            {lead.email}
          </a>
        </Row>
      )}
      <Row icon={MapPin}>
        {[lead.area, lead.city].filter(Boolean).join(", ") || "—"}
      </Row>
      <Row icon={FileText}>
        Source: {SOURCE_LABEL[lead.source]}
      </Row>
      <Row icon={Clock}>
        <span className="text-sm">
          Added by <span className="font-medium">{createdBy}</span> ·{" "}
          {formatDate(lead.created_at)}
        </span>
      </Row>
    </div>
  );
}

function PipelineCard({
  lead,
  daysInStatus,
}: {
  lead: Lead;
  daysInStatus: number;
}) {
  return (
    <div className="card-soft space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Pipeline
      </h3>
      <Row icon={GitBranch}>
        <span>
          Status:{" "}
          <span
            className={cn(
              "inline-flex px-2 py-0.5 ml-1 text-xs rounded-full font-medium",
              STATUS_PILL[lead.status],
            )}
          >
            {STATUS_LABEL[lead.status]}
          </span>
        </span>
      </Row>
      <Row icon={Calendar}>
        {lead.next_followup_date ? (
          <span>Next follow-up: {formatDate(lead.next_followup_date)}</span>
        ) : (
          <span className="text-muted-foreground">No follow-up scheduled</span>
        )}
      </Row>
      <Row icon={Coins}>
        {lead.quoted_amount != null ? (
          <span>Quoted: {formatCurrency(Number(lead.quoted_amount))}</span>
        ) : (
          <span className="text-muted-foreground">No quote sent yet</span>
        )}
      </Row>
      <Row icon={Hash}>
        <span>
          {daysInStatus} {daysInStatus === 1 ? "day" : "days"} in current status
        </span>
      </Row>
      {lead.maintenance_per_flat != null && (
        <Row icon={Coins}>
          <span>
            Maintenance: {formatCurrency(Number(lead.maintenance_per_flat))}
            /flat/mo
          </span>
        </Row>
      )}
      <Row icon={Flame}>
        <span>
          Interest:{" "}
          <span className="font-medium">
            {INTEREST_LABEL[lead.temperature]}
          </span>
        </span>
      </Row>
    </div>
  );
}

const INTEREST_LABEL: Record<LeadTemperature, string> = {
  hot: "🔥 High — likely to close",
  warm: "🌡️ Medium — needs nurture",
  cold: "❄️ Low — not promising",
};

function Row({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ActivityTimeline({
  activities,
  actorNames,
}: {
  activities: Activity[];
  actorNames: Record<string, string>;
}) {
  if (activities.length === 0) {
    return (
      <div className="card-soft text-sm text-muted-foreground text-center py-6">
        No activity yet. Use the form above to log a call, meeting, or note.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {activities.map((a) => {
        // Prefer the channel icon when the activity was logged via the
        // structured Log-a-Follow-up form (meta.channel set). Falls back
        // to the activity_type icon for legacy rows + status_change /
        // quote_sent / whatsapp_received entries.
        const channel = readChannel(a.meta);
        const Icon = channel ? CHANNEL_ICON[channel] : ACTIVITY_ICON[a.activity_type];
        const title = channel
          ? CHANNEL_LABEL[channel]
          : ACTIVITY_LABEL[a.activity_type];
        const actorName = a.actor_id ? actorNames[a.actor_id] || "—" : "—";
        return (
          <div key={a.id} className="card-soft">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="inline-flex items-center gap-2">
                    <span className="text-sm font-semibold">{title}</span>
                    {channel && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-primary/10 text-primary font-medium">
                        <Icon className="w-3 h-3" />
                        {CHANNEL_LABEL[channel]}
                      </span>
                    )}
                  </div>
                  <div
                    className="text-xs text-muted-foreground"
                    title={formatRelative(a.created_at)}
                  >
                    {formatActivityTimestamp(a.created_at)} · {actorName}
                  </div>
                </div>
                <ActivityBody activity={a} />
                {a.followup_due_date && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md bg-warning/10 text-warning font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    Next follow-up: {formatDate(a.followup_due_date)}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Audit-quality timestamp on each timeline row — absolute date + time
 * so a rep reviewing past follow-ups can answer "when exactly did we
 * call?" without guessing. The relative-time string lives on the
 * title attribute as a quick hover.
 */
function formatActivityTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Pull `meta.channel` off an activity row, narrowing to a FollowupChannel.
 * Returns null for legacy activities (no meta or unrecognised value) so
 * the timeline falls back to the activity_type icon.
 */
function readChannel(
  meta: Record<string, unknown> | null,
): FollowupChannel | null {
  if (!meta || typeof meta !== "object") return null;
  const c = (meta as { channel?: unknown }).channel;
  if (
    c === "call" ||
    c === "whatsapp" ||
    c === "meeting" ||
    c === "demo" ||
    c === "other"
  ) {
    return c;
  }
  return null;
}

function ActivityBody({ activity }: { activity: Activity }) {
  if (activity.activity_type === "status_change" && activity.meta) {
    const meta = activity.meta as {
      from?: string;
      to?: string;
      note?: string;
    };
    return (
      <div className="mt-1 text-sm">
        Moved from{" "}
        <span className="font-medium">
          {meta.from ? STATUS_LABEL[meta.from as LeadStatus] ?? meta.from : "—"}
        </span>{" "}
        to{" "}
        <span className="font-medium">
          {meta.to ? STATUS_LABEL[meta.to as LeadStatus] ?? meta.to : "—"}
        </span>
        {meta.note && (
          <div className="text-muted-foreground mt-1">“{meta.note}”</div>
        )}
      </div>
    );
  }
  if (activity.note) {
    return (
      <p className="mt-1 text-sm whitespace-pre-wrap">{activity.note}</p>
    );
  }
  return null;
}
