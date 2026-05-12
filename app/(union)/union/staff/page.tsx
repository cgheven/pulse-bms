import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatPhone } from "@/lib/utils";
import { ProposeButton } from "@/components/union/propose-button";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/types";

export const dynamic = "force-dynamic";

export default async function UnionStaffPage() {
  const { profile } = await requireRole("union");
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Staff</h1>
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("bms_staff")
    .select("id, full_name, role, phone, monthly_salary, join_date, exit_date, is_active")
    .eq("building_id", profile.building_id)
    .order("is_active", { ascending: false })
    .order("full_name", { ascending: true });

  const active = (staff ?? []).filter((s) => s.is_active);
  const inactive = (staff ?? []).filter((s) => !s.is_active);

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>Building staff</h1>
          <p className="text-muted-foreground mt-1">
            View-only list. Hiring or termination must go through a committee proposal.
          </p>
        </div>
        <ProposeButton
          proposal_type="hiring"
          buttonLabel="Propose hiring / termination"
          dialogTitle="Propose a staff change"
          dialogDescription="Describe the role, candidate, salary, and reason — the committee will vote."
          showAmount
        />
      </header>

      <section>
        <h2 className="mb-3">Active staff ({active.length})</h2>
        <div className="card-soft p-0 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-secondary text-sm uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Salary</th>
              </tr>
            </thead>
            <tbody>
              {active.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No active staff.
                  </td>
                </tr>
              ) : (
                active.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{s.full_name}</td>
                    <td className="px-4 py-3 text-sm">
                      {STAFF_ROLE_LABELS[s.role as StaffRole] ?? s.role}
                    </td>
                    <td className="px-4 py-3 text-sm">{s.phone ? formatPhone(s.phone) : "—"}</td>
                    <td className="px-4 py-3 text-sm">{s.join_date ? formatDate(s.join_date) : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatCurrency(Number(s.monthly_salary ?? 0))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {inactive.length > 0 && (
        <section>
          <h2 className="mb-3">Former staff ({inactive.length})</h2>
          <div className="card-soft p-0 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-secondary text-sm uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Exited</th>
                </tr>
              </thead>
              <tbody>
                {inactive.map((s) => (
                  <tr key={s.id} className="border-t border-border opacity-70">
                    <td className="px-4 py-3 font-medium">{s.full_name}</td>
                    <td className="px-4 py-3 text-sm">
                      {STAFF_ROLE_LABELS[s.role as StaffRole] ?? s.role}
                    </td>
                    <td className="px-4 py-3 text-sm">{s.join_date ? formatDate(s.join_date) : "—"}</td>
                    <td className="px-4 py-3 text-sm">{s.exit_date ? formatDate(s.exit_date) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
