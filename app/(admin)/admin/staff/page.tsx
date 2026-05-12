import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/types";
import { formatCurrency, formatDate, formatPhone } from "@/lib/utils";
import { StaffListActions } from "@/components/admin/staff/staff-list-actions";
import { StaffRowActions } from "@/components/admin/staff/staff-row-actions";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("bms_staff")
    .select("*")
    .eq("building_id", profile.building_id)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  const list = staff ?? [];
  const active = list.filter((s) => s.is_active).length;
  const totalSalary = list
    .filter((s) => s.is_active)
    .reduce((a, s) => a + Number(s.monthly_salary || 0), 0);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1>Staff</h1>
          <p className="text-muted-foreground mt-1">
            {active} active · {formatCurrency(totalSalary)} total monthly salary
          </p>
        </div>
        <StaffListActions />
      </div>

      <div className="card-soft p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold">Name</th>
                <th className="px-4 py-3 text-sm font-semibold">Role</th>
                <th className="px-4 py-3 text-sm font-semibold">Phone</th>
                <th className="px-4 py-3 text-sm font-semibold">Salary</th>
                <th className="px-4 py-3 text-sm font-semibold">Joined</th>
                <th className="px-4 py-3 text-sm font-semibold">Status</th>
                <th className="px-4 py-3 text-sm font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No staff yet. Click "Add Staff" to get started.
                  </td>
                </tr>
              )}
              {list.map((s) => (
                <tr key={s.id} className="border-t hover:bg-secondary/40">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/staff/${s.id}`} className="hover:underline">
                      {s.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {STAFF_ROLE_LABELS[s.role as StaffRole] ?? s.role}
                  </td>
                  <td className="px-4 py-3">{s.phone ? formatPhone(s.phone) : "—"}</td>
                  <td className="px-4 py-3">{formatCurrency(Number(s.monthly_salary || 0))}</td>
                  <td className="px-4 py-3">{s.join_date ? formatDate(s.join_date) : "—"}</td>
                  <td className="px-4 py-3">
                    {s.is_active ? (
                      <span className="status-paid px-2 py-0.5 rounded-full text-xs">
                        Active
                      </span>
                    ) : (
                      <span className="status-overdue px-2 py-0.5 rounded-full text-xs">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StaffRowActions staff={s} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
