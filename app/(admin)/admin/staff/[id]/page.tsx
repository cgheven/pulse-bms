import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/types";
import { formatCurrency, formatDate, formatPhone, formatCNIC } from "@/lib/utils";
import { AttendanceCalendar } from "@/components/admin/staff/attendance-calendar";
import { SalaryPanel } from "@/components/admin/staff/salary-panel";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ month?: string }>;

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const { id } = await params;
  const { month: monthParam } = await searchParams;
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("bms_staff")
    .select("*")
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .single();
  if (!staff) notFound();

  const { data: building } = await supabase
    .from("bms_buildings")
    .select("name")
    .eq("id", profile.building_id!)
    .single();

  const now = new Date();
  const month =
    monthParam ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const monthEnd = new Date(year, monthNum, 0).toISOString().split("T")[0];

  const { data: attendance } = await supabase
    .from("bms_attendance")
    .select("date,status")
    .eq("staff_id", id)
    .eq("building_id", profile.building_id)
    .gte("date", monthStart)
    .lte("date", monthEnd)
    .order("date", { ascending: true });

  const { data: payments } = await supabase
    .from("bms_salary_payments")
    .select("*")
    .eq("staff_id", id)
    .eq("building_id", profile.building_id)
    .order("pay_month", { ascending: false });

  return (
    <div className="space-y-6 animate-fade-up">
      <Link href="/admin/staff">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to staff
        </Button>
      </Link>

      <div className="card-soft">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1>{staff.full_name}</h1>
            <p className="text-muted-foreground mt-1">
              {STAFF_ROLE_LABELS[staff.role as StaffRole] ?? staff.role}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Monthly salary</div>
            <div className="text-2xl font-bold">
              {formatCurrency(Number(staff.monthly_salary || 0))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
          <div>
            <div className="text-muted-foreground">Phone</div>
            <div className="font-medium">
              {staff.phone ? formatPhone(staff.phone) : "—"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">CNIC</div>
            <div className="font-medium">
              {staff.cnic ? formatCNIC(staff.cnic) : "—"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Joined</div>
            <div className="font-medium">
              {staff.join_date ? formatDate(staff.join_date) : "—"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Status</div>
            <div className="font-medium">
              {staff.is_active ? "Active" : "Inactive"}
            </div>
          </div>
        </div>
        {staff.notes && (
          <p className="mt-4 text-sm bg-secondary p-3 rounded">{staff.notes}</p>
        )}
      </div>

      <h2 className="text-2xl">Attendance</h2>
      <AttendanceCalendar
        staffId={staff.id}
        attendance={(attendance ?? []) as { date: string; status: "present" | "absent" | "half_day" | "leave" }[]}
        initialMonth={month}
      />

      <SalaryPanel
        staff={{
          id: staff.id,
          full_name: staff.full_name,
          role: STAFF_ROLE_LABELS[staff.role as StaffRole] ?? staff.role,
          monthly_salary: Number(staff.monthly_salary || 0),
          join_date: staff.join_date,
        }}
        payments={(payments ?? []) as never}
        buildingName={building?.name ?? "Pulse BMS"}
      />
    </div>
  );
}
