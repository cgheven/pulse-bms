import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/types";
import { formatCurrency, formatDate, formatPhone, formatCNIC } from "@/lib/utils";
import { parseSlugSuffix } from "@/lib/slug";
import { AttendanceCalendar } from "@/components/admin/staff/attendance-calendar";
import { SalaryPanel } from "@/components/admin/staff/salary-panel";
import { StaffRowActions } from "@/components/admin/staff/staff-row-actions";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, IdCard, CalendarDays, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

const ROLE_TONE: Record<StaffRole, string> = {
  chowkidar:      "bg-[hsl(220_85%_38%/0.15)] text-[hsl(220_85%_60%)] border border-[hsl(220_85%_38%/0.3)]",
  sweeper:        "bg-[hsl(151_70%_32%/0.15)] text-[hsl(151_70%_45%)] border border-[hsl(151_70%_32%/0.3)]",
  lift_man:       "bg-[hsl(191_100%_50%/0.12)] text-[hsl(191_100%_55%)] border border-[hsl(191_100%_50%/0.2)]",
  generator_tech: "bg-[hsl(38_92%_55%/0.12)] text-[hsl(38_92%_65%)] border border-[hsl(38_92%_55%/0.2)]",
  plumber:        "bg-[hsl(280_60%_55%/0.15)] text-[hsl(280_60%_70%)] border border-[hsl(280_60%_55%/0.3)]",
  electrician:    "bg-[hsl(0_72%_55%/0.12)] text-[hsl(0_72%_65%)] border border-[hsl(0_72%_55%/0.2)]",
  other:          "bg-secondary text-foreground border border-border",
};

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

type SearchParams = Promise<{ month?: string }>;

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  const { id: slug } = await params;
  const { month: monthParam } = await searchParams;
  const supabase = await createClient();

  // Accept either full UUID (legacy links) or new slug like "abdul-sattar-00000006".
  // PostgREST has no LIKE operator on the `uuid` type, so for the slug path we
  // resolve the suffix → uuid in JS over the building's staff list (small N).
  const isUuid = /^[0-9a-f-]{36}$/i.test(slug);
  let resolvedId: string | null = null;

  if (isUuid) {
    resolvedId = slug;
  } else {
    const suffix = parseSlugSuffix(slug);
    if (!suffix) notFound();
    const { data: idList } = await supabase
      .from("bms_staff")
      .select("id")
      .eq("building_id", buildingId);
    const match = (idList ?? []).find((r) =>
      r.id.replace(/-/g, "").toLowerCase().endsWith(suffix),
    );
    if (!match) notFound();
    resolvedId = match.id;
  }

  const { data: staff } = await supabase
    .from("bms_staff")
    .select("*")
    .eq("building_id", buildingId)
    .eq("id", resolvedId)
    .maybeSingle();
  if (!staff) notFound();

  const { data: building } = await supabase
    .from("bms_buildings")
    .select("name")
    .eq("id", buildingId!)
    .single();

  const now = new Date();
  const month = monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const monthEnd = new Date(year, monthNum, 0).toISOString().split("T")[0];

  const [{ data: attendance }, { data: payments }] = await Promise.all([
    supabase
      .from("bms_attendance")
      .select("date,status")
      .eq("staff_id", staff.id)
      .eq("building_id", buildingId)
      .gte("date", monthStart)
      .lte("date", monthEnd)
      .order("date", { ascending: true }),
    supabase
      .from("bms_salary_payments")
      .select("*")
      .eq("staff_id", staff.id)
      .eq("building_id", buildingId)
      .order("pay_month", { ascending: false }),
  ]);

  const role = staff.role as StaffRole;
  const tone = ROLE_TONE[role] ?? ROLE_TONE.other;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Hero — Personnel Dossier */}
      <div className="relative rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-fade-up">
        {/* Ambient amber glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 w-80 h-80 rounded-full bg-primary/10 blur-3xl opacity-60"
        />
        {/* Hairline brand stripe across the very top */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
        />

        {/* ─── Command rail: back + label + actions ─── */}
        <div className="relative flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 border-b border-border bg-card/60 backdrop-blur-sm">
          <Link
            href="/admin/staff"
            className="group flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors rounded-md px-1.5 py-1 -ml-1.5 hover:bg-secondary/60"
            aria-label="Back to staff list"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-[10px] uppercase tracking-[0.22em] font-semibold hidden sm:inline">
              Back to Staff
            </span>
            <span className="text-[10px] uppercase tracking-[0.22em] font-semibold sm:hidden">
              Back
            </span>
          </Link>
          <StaffRowActions
            staff={{
              id: staff.id,
              full_name: staff.full_name,
              role: staff.role as StaffRole,
              phone: staff.phone,
              cnic: staff.cnic,
              monthly_salary: Number(staff.monthly_salary || 0),
              join_date: staff.join_date,
              exit_date: staff.exit_date,
              is_active: staff.is_active,
              notes: staff.notes,
              profile_id: staff.profile_id ?? null,
            }}
          />
        </div>

        {/* ─── Identity (avatar + FULL name + role/status pills) ─── */}
        <div className="relative px-5 sm:px-7 pt-6 sm:pt-7 pb-4 flex items-start gap-4 sm:gap-5">
          <div
            className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-xl sm:text-2xl font-bold shrink-0 shadow-lg ring-1 ring-white/5 ${tone}`}
          >
            <span
              aria-hidden
              className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-black/10 pointer-events-none"
            />
            <span className="relative">{initials(staff.full_name)}</span>
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="leading-[1.1] break-words">
              {staff.full_name}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${tone}`}>
                {STAFF_ROLE_LABELS[role] ?? staff.role}
              </span>
              {staff.is_active ? (
                <span className="status-paid inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium">
                  <span className="relative flex w-1.5 h-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-60 animate-ping" />
                    <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-current" />
                  </span>
                  Active
                </span>
              ) : (
                <span className="status-overdue inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium">
                  Inactive
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ─── Salary banner ─── */}
        <div className="px-5 sm:px-7 pb-5 sm:pb-6">
          <div className="relative rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-secondary/30 px-5 py-4 sm:px-6 sm:py-5 overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-14 -left-14 w-40 h-40 rounded-full bg-primary/15 blur-2xl"
            />
            <div className="relative flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-semibold text-primary/85">
                  <Wallet className="w-3 h-3" />
                  Monthly Salary
                </div>
                <div className="text-3xl sm:text-4xl md:text-[2.75rem] font-bold tabular-nums tracking-tight mt-1.5 leading-none text-foreground">
                  {formatCurrency(Number(staff.monthly_salary || 0))}
                </div>
              </div>
              <div className="hidden sm:flex w-12 h-12 rounded-xl bg-primary/10 border border-primary/25 items-center justify-center shrink-0 glow-amber">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Contact grid (hairline-divided) ─── */}
        <div className="px-5 sm:px-7 pb-6 sm:pb-7 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/70">
          <div className="py-3 sm:py-0 sm:pr-5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
              <Phone className="w-3 h-3" />
              Phone
            </div>
            <div className="font-medium mt-1 tabular-nums text-foreground">
              {staff.phone ? formatPhone(staff.phone) : "—"}
            </div>
          </div>
          <div className="py-3 sm:py-0 sm:px-5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
              <IdCard className="w-3 h-3" />
              CNIC
            </div>
            <div className="font-medium mt-1 tabular-nums text-foreground">
              {staff.cnic ? formatCNIC(staff.cnic) : "—"}
            </div>
          </div>
          <div className="py-3 sm:py-0 sm:pl-5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
              <CalendarDays className="w-3 h-3" />
              Joined
            </div>
            <div className="font-medium mt-1 text-foreground">
              {staff.join_date ? formatDate(staff.join_date) : "—"}
            </div>
          </div>
        </div>

        {/* ─── Notes (left-border quote) ─── */}
        {staff.notes && (
          <div className="px-5 sm:px-7 pb-6 sm:pb-7 -mt-2">
            <div className="relative rounded-lg border-l-2 border-primary/40 bg-secondary/30 pl-3 pr-3 py-2.5 text-sm text-muted-foreground italic leading-relaxed">
              &ldquo;{staff.notes}&rdquo;
            </div>
          </div>
        )}
      </div>

      {/* Attendance */}
      <section className="space-y-3">
        <h2>Attendance</h2>
        <AttendanceCalendar
          staffId={staff.id}
          attendance={(attendance ?? []) as { date: string; status: "present" | "absent" | "half_day" | "leave" }[]}
          initialMonth={month}
        />
      </section>

      {/* Salary disbursement */}
      <section className="space-y-3">
        <SalaryPanel
          staff={{
            id: staff.id,
            full_name: staff.full_name,
            role: STAFF_ROLE_LABELS[role] ?? staff.role,
            monthly_salary: Number(staff.monthly_salary || 0),
            join_date: staff.join_date,
          }}
          payments={(payments ?? []) as never}
          buildingName={building?.name ?? "Pulse BMS"}
        />
      </section>
    </div>
  );
}

function InfoCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide font-medium">
        {icon}
        {label}
      </div>
      <div className="font-medium mt-1">{value}</div>
    </div>
  );
}
