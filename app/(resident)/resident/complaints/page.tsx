import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatRelative, capitalize } from "@/lib/utils";
import { StatusPill, PriorityPill } from "@/components/resident/status-pill";
import { ComplaintDialog } from "@/components/resident/complaint-dialog";
import { KpiRowSkeleton, TableSkeleton } from "@/components/layout/table-skeleton";
import { MessageSquare, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

type ComplaintRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  resolution: string | null;
  flat_id: string | null;
  raised_by: string | null;
  created_at: string;
  resolved_at: string | null;
  bms_staff:
    | { full_name: string; role: string }
    | { full_name: string; role: string }[]
    | null;
};

export default async function ResidentComplaintsPage() {
  const { profile } = await requireRole("resident");

  return (
    <div className="space-y-5 animate-fade-up max-w-4xl">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1>Complaints</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Raise an issue with the building admin.
          </p>
        </div>
        <ComplaintDialog />
      </header>

      <Suspense
        fallback={
          <>
            <KpiRowSkeleton count={3} />
            <TableSkeleton rows={4} />
          </>
        }
      >
        <ComplaintsContent profileId={profile.id} buildingId={profile.building_id} />
      </Suspense>
    </div>
  );
}

async function ComplaintsContent({
  profileId,
  buildingId,
}: {
  profileId: string;
  buildingId: string | null;
}) {
  const supabase = await createClient();

  const { data: residentRows } = await supabase
    .from("bms_residents")
    .select("flat_id")
    .eq("profile_id", profileId)
    .eq("is_active", true);
  const flatIds = (residentRows ?? []).map((r) => r.flat_id).filter(Boolean) as string[];

  let complaints: ComplaintRow[] = [];
  if (buildingId) {
    let query = supabase
      .from("bms_complaints")
      .select(
        "id, title, description, category, priority, status, resolution, flat_id, raised_by, created_at, resolved_at, bms_staff:assigned_to(full_name, role)",
      )
      .eq("building_id", buildingId)
      .order("created_at", { ascending: false });

    if (flatIds.length > 0) {
      const flatList = flatIds.map((f) => `"${f}"`).join(",");
      query = query.or(`raised_by.eq.${profileId},flat_id.in.(${flatList})`);
    } else {
      query = query.eq("raised_by", profileId);
    }
    const { data } = await query;
    complaints = (data ?? []) as unknown as ComplaintRow[];
  }

  const openCount = complaints.filter(
    (c) => c.status !== "resolved" && c.status !== "closed",
  ).length;
  const resolvedCount = complaints.filter(
    (c) => c.status === "resolved" || c.status === "closed",
  ).length;

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Total" value={complaints.length} />
        <Kpi label="Open" value={openCount} tone={openCount > 0 ? "danger" : "neutral"} />
        <Kpi label="Resolved" value={resolvedCount} tone="success" />
      </div>

      {complaints.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">No complaints yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click <span className="font-medium text-foreground">Raise complaint</span> above to report an issue.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {complaints.map((c) => {
            const staff = Array.isArray(c.bms_staff) ? c.bms_staff[0] : c.bms_staff;
            const isResolved = c.status === "resolved" || c.status === "closed";
            return (
              <article
                key={c.id}
                className={cn(
                  "rounded-lg border bg-card p-4 transition-colors",
                  isResolved ? "border-border" : "border-border hover:border-primary/30",
                )}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold tracking-tight">{c.title}</h3>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDate(c.created_at)} · {formatRelative(c.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusPill status={c.status} />
                    <PriorityPill priority={c.priority} />
                  </div>
                </div>

                {c.description && (
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap leading-relaxed">
                    {c.description}
                  </p>
                )}

                <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {c.category && (
                    <span>
                      <span className="text-muted-foreground/70">Category:</span>{" "}
                      <span className="text-foreground">{capitalize(c.category)}</span>
                    </span>
                  )}
                  <span>
                    <span className="text-muted-foreground/70">Assigned:</span>{" "}
                    <span className="text-foreground">
                      {staff
                        ? `${staff.full_name} · ${capitalize(staff.role.replace("_", " "))}`
                        : "—"}
                    </span>
                  </span>
                  {(c.resolution || isResolved) && (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-[hsl(151_70%_55%)]" />
                      <span className="text-foreground">{c.resolution ?? "Resolved"}</span>
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-[hsl(151_70%_55%)]"
      : tone === "danger"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-xl sm:text-2xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}
