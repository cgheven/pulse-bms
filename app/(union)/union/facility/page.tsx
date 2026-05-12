import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { ProposeButton } from "@/components/union/propose-button";

export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<string, string> = {
  pending: "status-pending",
  in_progress: "status-info",
  done: "status-paid",
  overdue: "status-overdue",
  cancelled: "bg-gray-200 text-gray-700 border border-gray-300",
};

export default async function UnionFacilityPage() {
  const { profile } = await requireRole("union");
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Facility</h1>
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  const supabase = await createClient();

  const { data: tasks } = await supabase
    .from("bms_facility_tasks")
    .select("id, title, description, task_type, category, next_due_date, last_done_date, status")
    .eq("building_id", profile.building_id)
    .order("next_due_date", { ascending: true });

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>Facility tasks</h1>
          <p className="text-muted-foreground mt-1">
            View only. Need a repair? Raise a proposal so the committee can approve the spend.
          </p>
        </div>
        <ProposeButton
          proposal_type="repair"
          buttonLabel="Propose repair"
          dialogTitle="Propose a repair"
          dialogDescription="What needs fixing? Add cost estimate if known."
          showAmount
        />
      </header>

      <div className="card-soft p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-secondary text-sm uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Next due</th>
              <th className="px-4 py-3">Last done</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(tasks ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No facility tasks recorded.
                </td>
              </tr>
            ) : (
              (tasks ?? []).map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{t.title}</td>
                  <td className="px-4 py-3 text-sm">{t.category ?? "—"}</td>
                  <td className="px-4 py-3 text-sm">{t.task_type ?? "—"}</td>
                  <td className="px-4 py-3 text-sm">
                    {t.next_due_date ? formatDate(t.next_due_date) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {t.last_done_date ? formatDate(t.last_done_date) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        STATUS_CLASS[t.status ?? "pending"] ?? STATUS_CLASS.pending
                      }`}
                    >
                      {t.status ?? "pending"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
