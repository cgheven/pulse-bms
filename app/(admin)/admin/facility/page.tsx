import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { AddTaskButton } from "@/components/admin/facility/add-task-button";
import { TaskRowActions } from "@/components/admin/facility/task-row-actions";
import { ComplaintActions } from "@/components/admin/facility/complaint-actions";
import { Wrench, AlertCircle, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import type {
  FacilityTaskInput,
  ComplaintStatus,
} from "@/app/actions/facility";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, string> = {
  open:         "status-pending",
  assigned:     "status-info",
  in_progress:  "status-info",
  resolved:     "status-paid",
  pending:      "status-pending",
  done:         "status-paid",
  skipped:      "status-overdue",
  overdue:      "status-overdue",
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

const PRIORITY_PILL: Record<string, string> = {
  low:    "bg-secondary text-muted-foreground border border-border",
  normal: "status-info",
  high:   "status-pending",
  urgent: "status-overdue",
};
const PRIORITY_LABEL: Record<string, string> = {
  low: "Low", normal: "Normal", high: "High", urgent: "Urgent",
};

const CATEGORY_LABELS: Record<string, string> = {
  pest: "Pest Control",
  pest_control: "Pest Control",
  lift_service: "Lift Service",
  lift: "Lift",
  generator: "Generator",
  painting: "Painting",
  plumbing: "Plumbing",
  electrical: "Electrical",
  cleaning: "Cleaning",
  security: "Security",
  garden: "Garden / Landscape",
  water_tank: "Water Tank",
  fire_safety: "Fire Safety",
};

function prettifyCategory(s: string | null | undefined): string {
  if (!s) return "—";
  if (CATEGORY_LABELS[s]) return CATEGORY_LABELS[s];
  return s.split(/[_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export default function FacilityPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1>Facility</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Scheduled tasks and complaints for this building.
          </p>
        </div>
      </div>

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <FacilityContent />
      </Suspense>
    </div>
  );
}

async function FacilityContent() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const supabase = await createClient();

  const [tasksRes, complaintsRes, staffRes] = await Promise.all([
    supabase
      .from("bms_facility_tasks")
      .select("*")
      .eq("building_id", profile.building_id)
      .order("next_due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("bms_complaints")
      .select("*")
      .eq("building_id", profile.building_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("bms_staff")
      .select("id,full_name")
      .eq("building_id", profile.building_id)
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
  ]);

  const tasks = tasksRes.data ?? [];
  const complaints = complaintsRes.data ?? [];
  const staff = staffRes.data ?? [];
  const staffMap = new Map(staff.map((s) => [s.id, s.full_name]));

  const today = new Date().toISOString().split("T")[0];
  const openComplaints = complaints.filter((c) => c.status !== "resolved" && c.status !== "closed").length;
  const overdueTasks = tasks.filter((t) => t.next_due_date && t.next_due_date < today && t.status !== "done").length;

  return (
    <div className="space-y-6">
      {/* Stats + CTA */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-muted-foreground mt-1 text-sm sm:text-base flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" />
            {tasks.length} scheduled task{tasks.length !== 1 ? "s" : ""}
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="inline-flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {openComplaints} open complaint{openComplaints !== 1 ? "s" : ""}
          </span>
          {overdueTasks > 0 && (
            <>
              <span className="hidden sm:inline">·</span>
              <span className="inline-flex items-center gap-1.5 text-destructive font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                {overdueTasks} overdue
              </span>
            </>
          )}
        </p>
        <AddTaskButton staff={staff} />
      </div>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">
            Scheduled Tasks ({tasks.length})
          </TabsTrigger>
          <TabsTrigger value="complaints">
            Complaints ({openComplaints} open)
          </TabsTrigger>
        </TabsList>

        {/* ─── Tasks ─── */}
        <TabsContent value="tasks" className="mt-4">
          <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b border-border">
                  <tr className="text-left">
                    <th className="px-3 py-3 font-semibold">Task</th>
                    <th className="px-3 py-3 font-semibold">Category</th>
                    <th className="px-3 py-3 font-semibold">Next Due</th>
                    <th className="px-3 py-3 font-semibold">Assigned</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {tasks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                        No tasks yet. Click <span className="text-foreground font-medium">New Task</span> to start.
                      </td>
                    </tr>
                  )}
                  {tasks.map((t) => {
                    const overdue = t.next_due_date && t.next_due_date < today && t.status !== "done";
                    const status = overdue ? "overdue" : (t.status ?? "pending");
                    return (
                      <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/50 align-top">
                        <td className="px-3 py-3 min-w-[200px]">
                          <div className="font-semibold text-foreground">{t.title}</div>
                          {t.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
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
                        <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                          {prettifyCategory(t.category)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap tabular-nums">
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
                        <td className="px-3 py-3 whitespace-nowrap">
                          {t.assigned_to ? (
                            <span className="text-foreground">{staffMap.get(t.assigned_to) ?? "—"}</span>
                          ) : (
                            <span className="text-muted-foreground italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[status] ?? STATUS_PILL.pending}`}>
                            {STATUS_LABEL[status] ?? status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
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

        {/* ─── Complaints ─── */}
        <TabsContent value="complaints" className="mt-4">
          <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b border-border">
                  <tr className="text-left">
                    <th className="px-3 py-3 font-semibold">Complaint</th>
                    <th className="px-3 py-3 font-semibold">Priority</th>
                    <th className="px-3 py-3 font-semibold">Raised</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {complaints.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-12 text-center text-muted-foreground">
                        No complaints filed.
                      </td>
                    </tr>
                  )}
                  {complaints.map((c) => {
                    const priority = c.priority ?? "normal";
                    return (
                      <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/50 align-top">
                        <td className="px-3 py-3 min-w-[220px]">
                          <div className="font-semibold text-foreground">{c.title}</div>
                          {c.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>
                          )}
                          {c.category && (
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mt-1">
                              {prettifyCategory(c.category)}
                            </div>
                          )}
                          {c.resolution && (
                            <div className="mt-2 text-xs flex items-start gap-1.5 p-2 rounded-md bg-[hsl(151_70%_32%/0.1)] border border-[hsl(151_70%_32%/0.25)] text-[hsl(151_70%_55%)]">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <div>
                                <strong className="font-semibold">Resolved:</strong> {c.resolution}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_PILL[priority] ?? PRIORITY_PILL.normal}`}>
                            {PRIORITY_LABEL[priority] ?? priority}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                          {c.created_at ? formatDate(c.created_at) : "—"}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[c.status ?? "open"]}`}>
                            {STATUS_LABEL[c.status ?? "open"] ?? c.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <ComplaintActions
                            complaintId={c.id}
                            currentStatus={(c.status ?? "open") as ComplaintStatus}
                            currentAssignee={c.assigned_to}
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
      </Tabs>
    </div>
  );
}
