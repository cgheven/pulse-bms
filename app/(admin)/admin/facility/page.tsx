import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { formatDate } from "@/lib/utils";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { AddTaskButton } from "@/components/admin/facility/add-task-button";
import { TaskRowActions } from "@/components/admin/facility/task-row-actions";
import {
  ComplaintsTable,
  type ComplaintRow,
} from "@/components/admin/facility/complaints-table";
import {
  Wrench,
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import { StatCard } from "@/components/ui/stat-card";
import type { FacilityTaskInput } from "@/app/actions/facility";

export const dynamic = "force-dynamic";

/* ── constants ─────────────────────────────────────────────────────────── */

const STATUS_PILL: Record<string, string> = {
  open:        "status-pending",
  assigned:    "status-info",
  in_progress: "status-info",
  resolved:    "status-paid",
  pending:     "status-pending",
  done:        "status-paid",
  skipped:     "status-overdue",
  overdue:     "status-overdue",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open", assigned: "Assigned", in_progress: "In Progress",
  resolved: "Resolved", pending: "Pending", done: "Done",
  skipped: "Skipped", overdue: "Overdue",
};

const RECURRENCE_LABEL: Record<string, string> = {
  daily: "Daily", weekly: "Weekly", monthly: "Monthly",
  quarterly: "Quarterly", yearly: "Yearly",
};

const CATEGORY_LABELS: Record<string, string> = {
  pest: "Pest Control", pest_control: "Pest Control",
  lift_service: "Lift Service", lift: "Lift",
  generator: "Generator", painting: "Painting",
  plumbing: "Plumbing", electrical: "Electrical",
  cleaning: "Cleaning", security: "Security",
  garden: "Garden / Landscape", water_tank: "Water Tank",
  fire_safety: "Fire Safety",
};

function prettifyCategory(s: string | null | undefined): string {
  if (!s) return "—";
  if (CATEGORY_LABELS[s]) return CATEGORY_LABELS[s];
  return s.split(/[_\s]+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/* ── page shell ────────────────────────────────────────────────────────── */

export default function FacilityPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <FacilityContent />
      </Suspense>
    </div>
  );
}

/* ── data + content ────────────────────────────────────────────────────── */

async function FacilityContent() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  const supabase = await createClient();

  const [tasksRes, complaintsRes, staffRes] = await Promise.all([
    supabase
      .from("bms_facility_tasks")
      .select("*")
      .eq("building_id", buildingId)
      .order("next_due_date", { ascending: true, nullsFirst: false })
      .limit(200),

    supabase
      .from("bms_complaints")
      .select(`
        *,
        bms_residents!resident_id (full_name),
        bms_flats!flat_id (flat_number)
      `)
      .eq("building_id", buildingId)
      .order("created_at", { ascending: false })
      .limit(300),

    supabase
      .from("bms_staff")
      .select("id,full_name")
      .eq("building_id", buildingId)
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
  ]);

  const tasks      = tasksRes.data ?? [];
  const complaints = complaintsRes.data ?? [];
  const staff      = staffRes.data ?? [];
  const staffMap   = new Map(staff.map((s) => [s.id, s.full_name]));

  const today        = new Date().toISOString().split("T")[0];
  const openComplaints = complaints.filter(
    (c) => c.status !== "resolved" && c.status !== "closed",
  ).length;
  const overdueTasks = tasks.filter(
    (t) => t.next_due_date && t.next_due_date < today && t.status !== "done",
  ).length;
  const resolvedComplaints = complaints.filter(
    (c) => c.status === "resolved" || c.status === "closed",
  ).length;
  const recurringTasks = tasks.filter((t) => t.recurrence).length;

  // Helper: flatten nested resident / flat objects (PostgREST may return array or object)
  function residentName(c: (typeof complaints)[number]): string | null {
    const r = c.bms_residents;
    if (!r) return null;
    const obj = Array.isArray(r) ? r[0] : r;
    return (obj as { full_name?: string })?.full_name ?? null;
  }
  function flatNumber(c: (typeof complaints)[number]): string | null {
    const f = c.bms_flats;
    if (!f) return null;
    const obj = Array.isArray(f) ? f[0] : f;
    return (obj as { flat_number?: string })?.flat_number ?? null;
  }

  // Flatten complaints into plain rows for the client-side filterable table.
  const complaintRows: ComplaintRow[] = complaints.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description ?? null,
    category: c.category ?? null,
    priority: c.priority ?? "normal",
    status: c.status ?? "open",
    resolution: c.resolution ?? null,
    assigned_to: c.assigned_to ?? null,
    created_at: c.created_at ?? null,
    residentName: residentName(c),
    flatNumber: flatNumber(c),
  }));

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1>Facility</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Maintenance tasks and resident complaints for this building.
          </p>
        </div>
        <AddTaskButton staff={staff} />
      </div>

      {/* ── KPI row — fills the top band with at-a-glance numbers ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Wrench}
          label="Scheduled Tasks"
          value={tasks.length}
          sub={recurringTasks > 0 ? `${recurringTasks} recurring` : "all one-time"}
        />
        <StatCard
          icon={AlertCircle}
          label="Open Complaints"
          value={openComplaints}
          tone={openComplaints > 0 ? "warning" : "default"}
          sub={`${complaints.length} filed all-time`}
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue Tasks"
          value={overdueTasks}
          tone={overdueTasks > 0 ? "danger" : "default"}
          sub={overdueTasks > 0 ? "need rescheduling" : "all on schedule"}
        />
        <StatCard
          icon={CheckCircle2}
          label="Resolved"
          value={resolvedComplaints}
          tone={resolvedComplaints > 0 ? "success" : "default"}
          sub="complaints closed"
        />
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="complaints">
        <TabsList>
          <TabsTrigger value="tasks">
            Scheduled Tasks ({tasks.length})
          </TabsTrigger>
          <TabsTrigger value="complaints">
            Complaints {openComplaints > 0 && `(${openComplaints} open)`}
          </TabsTrigger>
        </TabsList>

        {/* ── Tasks tab ── */}
        <TabsContent value="tasks" className="mt-4">
          <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b border-border">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Task</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Next Due</th>
                    <th className="px-4 py-3 font-semibold">Assigned</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {tasks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        No tasks yet.{" "}
                        <span className="text-foreground font-medium">New Task</span>{" "}
                        to get started.
                      </td>
                    </tr>
                  )}
                  {tasks.map((t) => {
                    const overdue = t.next_due_date && t.next_due_date < today && t.status !== "done";
                    const status  = overdue ? "overdue" : (t.status ?? "pending");
                    return (
                      <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/40 align-top">
                        <td className="px-4 py-3 min-w-[200px]">
                          <div className="font-semibold text-foreground">{t.title}</div>
                          {t.description && (
                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</div>
                          )}
                          {t.recurrence ? (
                            <span className="inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary border border-border text-muted-foreground">
                              <Clock className="w-2.5 h-2.5" />
                              {RECURRENCE_LABEL[t.recurrence] ?? t.recurrence}
                            </span>
                          ) : (
                            <span className="inline-flex items-center mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary border border-border text-muted-foreground">
                              One-time
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                          {prettifyCategory(t.category)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                          {t.next_due_date ? (
                            <span className={overdue ? "text-destructive font-semibold" : "text-foreground"}>
                              {formatDate(t.next_due_date)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {t.last_done_date && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              Last: {formatDate(t.last_done_date)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {t.assigned_to ? (
                            <span className="text-foreground">{staffMap.get(t.assigned_to) ?? "—"}</span>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[status] ?? STATUS_PILL.pending}`}>
                            {STATUS_LABEL[status] ?? status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <TaskRowActions
                            task={t as FacilityTaskInput & { id: string }}
                            staff={staff}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── Complaints tab ── */}
        <TabsContent value="complaints" className="mt-4">
          <ComplaintsTable rows={complaintRows} staff={staff} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
