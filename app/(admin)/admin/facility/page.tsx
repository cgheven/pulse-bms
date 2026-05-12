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
import type {
  FacilityTaskInput,
  ComplaintStatus,
} from "@/app/actions/facility";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, string> = {
  open: "status-pending",
  assigned: "status-info",
  in_progress: "status-info",
  resolved: "status-paid",
  pending: "status-pending",
  done: "status-paid",
  skipped: "status-overdue",
};

export default async function FacilityPage() {
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

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1>Facility</h1>
          <p className="text-muted-foreground mt-1">
            Scheduled tasks and resident complaints
          </p>
        </div>
        <AddTaskButton staff={staff} />
      </div>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">
            Scheduled tasks ({tasks.length})
          </TabsTrigger>
          <TabsTrigger value="complaints">
            Complaints ({complaints.filter((c) => c.status !== "resolved").length} open)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <div className="card-soft p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary text-left">
                  <tr>
                    <th className="px-4 py-3 text-sm font-semibold">Title</th>
                    <th className="px-4 py-3 text-sm font-semibold">Category</th>
                    <th className="px-4 py-3 text-sm font-semibold">Recurrence</th>
                    <th className="px-4 py-3 text-sm font-semibold">Next due</th>
                    <th className="px-4 py-3 text-sm font-semibold">Last done</th>
                    <th className="px-4 py-3 text-sm font-semibold">Assigned</th>
                    <th className="px-4 py-3 text-sm font-semibold">Status</th>
                    <th className="px-4 py-3 text-sm font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                        No tasks yet. Click "New Task" to start.
                      </td>
                    </tr>
                  )}
                  {tasks.map((t) => {
                    const overdue =
                      t.next_due_date && t.next_due_date < today;
                    return (
                      <tr key={t.id} className="border-t hover:bg-secondary/40">
                        <td className="px-4 py-3 font-medium">
                          {t.title}
                          {t.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {t.description}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">{t.category ?? "—"}</td>
                        <td className="px-4 py-3">
                          {t.recurrence ?? (
                            <span className="text-muted-foreground">one-off</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {t.next_due_date ? (
                            <span
                              className={
                                overdue
                                  ? "text-destructive font-semibold"
                                  : ""
                              }
                            >
                              {formatDate(t.next_due_date)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {t.last_done_date ? formatDate(t.last_done_date) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {t.assigned_to
                            ? staffMap.get(t.assigned_to) ?? "—"
                            : (
                              <span className="text-muted-foreground">
                                Unassigned
                              </span>
                            )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`${STATUS_PILL[t.status ?? "pending"]} px-2 py-0.5 rounded-full text-xs`}
                          >
                            {t.status ?? "pending"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
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

        <TabsContent value="complaints">
          <div className="card-soft p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary text-left">
                  <tr>
                    <th className="px-4 py-3 text-sm font-semibold">Title</th>
                    <th className="px-4 py-3 text-sm font-semibold">Category</th>
                    <th className="px-4 py-3 text-sm font-semibold">Priority</th>
                    <th className="px-4 py-3 text-sm font-semibold">Raised</th>
                    <th className="px-4 py-3 text-sm font-semibold">Status</th>
                    <th className="px-4 py-3 text-sm font-semibold">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {complaints.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        No complaints filed.
                      </td>
                    </tr>
                  )}
                  {complaints.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-secondary/40 align-top">
                      <td className="px-4 py-3 font-medium">
                        {c.title}
                        {c.description && (
                          <div className="text-xs text-muted-foreground mt-1 max-w-md">
                            {c.description}
                          </div>
                        )}
                        {c.resolution && (
                          <div className="text-xs mt-2 p-2 bg-green-50 border border-green-200 rounded">
                            <strong>Resolution:</strong> {c.resolution}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">{c.category ?? "—"}</td>
                      <td className="px-4 py-3">{c.priority ?? "normal"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {c.created_at ? formatDate(c.created_at) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`${STATUS_PILL[c.status ?? "open"]} px-2 py-0.5 rounded-full text-xs`}
                        >
                          {c.status ?? "open"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ComplaintActions
                          complaintId={c.id}
                          currentStatus={(c.status ?? "open") as ComplaintStatus}
                          currentAssignee={c.assigned_to}
                          staff={staff}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
