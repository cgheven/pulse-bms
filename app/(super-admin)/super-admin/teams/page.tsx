import { Suspense } from "react";
import { Users, UserCheck, UserX } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { formatDate, formatRelative, cn } from "@/lib/utils";
import { TableSkeleton, KpiRowSkeleton } from "@/components/layout/table-skeleton";
import { AddTeamMemberButton } from "@/components/teams/add-team-member-dialog";
import { TeamRowActions } from "@/components/teams/team-row-actions";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  // Locked to super_admin — sales users get redirected to their own home
  // (/super-admin/leads) by requireRole().
  await requireRole("super_admin");

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>Team Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sales reps and other restricted team accounts. They can only see
            the Leads CRM &mdash; not customer buildings, finance, or residents.
          </p>
        </div>
        <AddTeamMemberButton />
      </div>

      <Suspense fallback={<KpiRowSkeleton count={2} />}>
        <TeamsKpis />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <TeamsTable />
      </Suspense>
    </div>
  );
}

async function TeamsKpis() {
  // Admin client because bms_profiles row-level reads of other users
  // require elevated access.
  const admin = createAdminClient();
  const [activeRes, inactiveRes] = await Promise.all([
    admin
      .from("bms_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "sales")
      .eq("is_active", true),
    admin
      .from("bms_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "sales")
      .eq("is_active", false),
  ]);

  const active = activeRes.count ?? 0;
  const inactive = inactiveRes.count ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <Kpi label="Active team members" value={active} icon={UserCheck} success={active > 0} />
      <Kpi
        label="Inactive"
        value={inactive}
        icon={UserX}
        warn={inactive > 0}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  warn,
  success,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  warn?: boolean;
  success?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div
          className={cn(
            "flex w-8 h-8 items-center justify-center rounded-md shrink-0",
            warn
              ? "bg-warning/15 text-warning"
              : success
              ? "bg-success/15 text-success"
              : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}

type TeamMember = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
};

async function TeamsTable() {
  // Use the admin client so we can read EVERY sales profile, not just
  // those the caller's RLS would otherwise allow. Auth is gated at the
  // page level (requireRole) already.
  const admin = createAdminClient();
  const profilesRes = await admin
    .from("bms_profiles")
    .select("id, email, full_name, phone, is_active, created_at")
    .eq("role", "sales")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  const members = (profilesRes.data ?? []) as TeamMember[];

  // Last-sign-in lookup via auth.admin.listUsers. We page through (max
  // 1000 per page) and build a map of id -> last_sign_in_at for the
  // small subset we care about. For org sizes <1k this is a single page.
  const lastSignInById: Record<string, string | null> = {};
  if (members.length > 0) {
    const ids = new Set(members.map((m) => m.id));
    let page = 1;
    while (page <= 50) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error || !data?.users || data.users.length === 0) break;
      for (const u of data.users) {
        if (ids.has(u.id)) {
          lastSignInById[u.id] = u.last_sign_in_at ?? null;
        }
      }
      if (data.users.length < 1000) break;
      page++;
    }
  }

  if (profilesRes.error) {
    return (
      <div className="card-soft border-destructive/40 bg-destructive/5 text-destructive">
        Could not load team members. Please refresh.
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="card-soft text-center py-12">
        <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="text-lg font-semibold">No team members yet</h3>
        <p className="text-muted-foreground mt-1">
          Add a sales rep to give them access to the Leads CRM.
        </p>
        <div className="mt-4 inline-block">
          <AddTeamMemberButton />
        </div>
      </div>
    );
  }

  return (
    <div className="card-soft p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="px-4 py-3 text-sm font-semibold">Name</th>
              <th className="px-4 py-3 text-sm font-semibold">Email</th>
              <th className="px-4 py-3 text-sm font-semibold">Role</th>
              <th className="px-4 py-3 text-sm font-semibold">Status</th>
              <th className="px-4 py-3 text-sm font-semibold">Created</th>
              <th className="px-4 py-3 text-sm font-semibold">Last sign-in</th>
              <th className="px-4 py-3 text-sm font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const lastSignIn = lastSignInById[m.id] ?? null;
              return (
                <tr key={m.id} className="border-t border-border hover:bg-secondary/50">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{m.full_name || "Unnamed"}</div>
                    {m.phone && (
                      <div className="text-xs text-muted-foreground">{m.phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">{m.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2.5 py-0.5 text-xs rounded-full bg-primary/15 text-primary font-medium">
                      Sales
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {m.is_active ? (
                      <span className="status-paid inline-flex px-2.5 py-0.5 text-xs rounded-full">
                        Active
                      </span>
                    ) : (
                      <span className="status-overdue inline-flex px-2.5 py-0.5 text-xs rounded-full">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {m.created_at ? formatDate(m.created_at) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap text-muted-foreground">
                    {lastSignIn ? formatRelative(lastSignIn) : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <TeamRowActions
                      member={{
                        id: m.id,
                        email: m.email,
                        full_name: m.full_name,
                        phone: m.phone,
                        is_active: !!m.is_active,
                      }}
                    />
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
