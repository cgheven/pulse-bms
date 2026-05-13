import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/types";
import { formatCurrency, formatPhone } from "@/lib/utils";
import { buildSlug } from "@/lib/slug";
import { StaffListActions } from "@/components/admin/staff/staff-list-actions";
import { StaffRowActions } from "@/components/admin/staff/staff-row-actions";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

/** Tone class for the role badge — color identity helps scanning. */
const ROLE_TONE: Record<StaffRole, string> = {
  chowkidar:      "bg-[hsl(220_85%_38%/0.15)] text-[hsl(220_85%_60%)] border border-[hsl(220_85%_38%/0.3)]",
  sweeper:        "bg-[hsl(151_70%_32%/0.15)] text-[hsl(151_70%_45%)] border border-[hsl(151_70%_32%/0.3)]",
  lift_man:       "bg-[hsl(191_100%_50%/0.12)] text-[hsl(191_100%_55%)] border border-[hsl(191_100%_50%/0.2)]",
  generator_tech: "bg-[hsl(38_92%_55%/0.12)] text-[hsl(38_92%_65%)] border border-[hsl(38_92%_55%/0.2)]",
  plumber:        "bg-[hsl(280_60%_55%/0.15)] text-[hsl(280_60%_70%)] border border-[hsl(280_60%_55%/0.3)]",
  electrician:    "bg-[hsl(0_72%_55%/0.12)] text-[hsl(0_72%_65%)] border border-[hsl(0_72%_55%/0.2)]",
  other:          "bg-secondary text-foreground border border-border",
};

const ATTEND_TONE: Record<string, string> = {
  present:  "bg-[hsl(151_70%_32%/0.15)] text-[hsl(151_70%_45%)] border border-[hsl(151_70%_32%/0.3)]",
  absent:   "bg-[hsl(0_72%_55%/0.15)] text-[hsl(0_72%_65%)] border border-[hsl(0_72%_55%/0.3)]",
  half_day: "bg-[hsl(38_92%_55%/0.12)] text-[hsl(38_92%_65%)] border border-[hsl(38_92%_55%/0.2)]",
  leave:    "bg-[hsl(191_100%_50%/0.12)] text-[hsl(191_100%_55%)] border border-[hsl(191_100%_50%/0.2)]",
};
const ATTEND_LABEL: Record<string, string> = {
  present: "P", absent: "A", half_day: "½", leave: "L",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function StaffPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header: title + actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1>Staff</h1>
          <Suspense
            fallback={
              <p className="text-muted-foreground mt-1 text-sm">Loading summary…</p>
            }
          >
            <StaffKpiSubtitle />
          </Suspense>
        </div>
        <StaffListActions />
      </div>

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <StaffContent />
      </Suspense>

      <p className="text-xs text-muted-foreground">
        Legend: <span className="font-medium">P</span> Present · <span className="font-medium">A</span> Absent · <span className="font-medium">½</span> Half-day · <span className="font-medium">L</span> Leave · <span className="font-medium">—</span> Not marked
      </p>
    </div>
  );
}

async function loadStaffData() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: staff }, { data: todayAttendance }] = await Promise.all([
    supabase
      .from("bms_staff")
      .select("*")
      .eq("building_id", profile.building_id)
      .order("is_active", { ascending: false })
      .order("full_name", { ascending: true }),
    supabase
      .from("bms_attendance")
      .select("staff_id, status")
      .eq("building_id", profile.building_id)
      .eq("date", today),
  ]);

  const list = staff ?? [];
  const attendByStaff = new Map(
    (todayAttendance ?? []).map((a) => [a.staff_id, a.status as string]),
  );

  const active = list.filter((s) => s.is_active).length;
  const totalSalary = list
    .filter((s) => s.is_active)
    .reduce((a, s) => a + Number(s.monthly_salary || 0), 0);
  const presentToday = (todayAttendance ?? []).filter((a) => a.status === "present").length;

  return { list, attendByStaff, active, totalSalary, presentToday };
}

async function StaffKpiSubtitle() {
  const { active, totalSalary, presentToday } = await loadStaffData();
  return (
    <p className="text-muted-foreground mt-1 text-sm">
      {active} active · {formatCurrency(totalSalary)} monthly salary · {presentToday}/{active} present today
    </p>
  );
}

async function StaffContent() {
  const { list, attendByStaff } = await loadStaffData();

  return (
    <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary border-b border-border">
            <tr className="text-left">
              <th className="px-3 py-3 font-semibold">Staff</th>
              <th className="px-3 py-3 font-semibold">Role</th>
              <th className="px-3 py-3 font-semibold">Phone</th>
              <th className="px-3 py-3 font-semibold text-right">Salary</th>
              <th className="px-3 py-3 font-semibold text-center" title="Today's attendance">Today</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                  No staff yet. Click <span className="text-foreground font-medium">Add Staff</span> to get started.
                </td>
              </tr>
            )}
            {list.map((s) => {
              const role = s.role as StaffRole;
              const today = attendByStaff.get(s.id) ?? null;
              return (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Link
                      href={`/admin/staff/${buildSlug(s.full_name, s.id)}`}
                      className="flex items-center gap-3 group"
                    >
                      <span
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${ROLE_TONE[role] ?? ROLE_TONE.other}`}
                      >
                        {initials(s.full_name)}
                      </span>
                      <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {s.full_name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_TONE[role] ?? ROLE_TONE.other}`}
                    >
                      {STAFF_ROLE_LABELS[role] ?? s.role}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                    {s.phone ? formatPhone(s.phone) : "—"}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right font-semibold tabular-nums">
                    {formatCurrency(Number(s.monthly_salary || 0))}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {today ? (
                      <span
                        className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-bold ${ATTEND_TONE[today] ?? ""}`}
                        title={`Today: ${today.replace("_", " ")}`}
                      >
                        {ATTEND_LABEL[today] ?? "?"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60 text-xs" title="Not marked yet">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {s.is_active ? (
                      <span className="status-paid inline-flex px-2 py-0.5 rounded-full text-xs">
                        Active
                      </span>
                    ) : (
                      <span className="status-overdue inline-flex px-2 py-0.5 rounded-full text-xs">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <StaffRowActions staff={s} />
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
