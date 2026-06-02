import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { AdminInviteButton } from "@/components/super-admin/admin-invite-dialog";
import { AdminRowActions } from "@/components/super-admin/admin-row-actions";
import { AdminBuildingsDialog } from "@/components/super-admin/admin-buildings-dialog";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

export default async function AdminsListPage() {
  await requireRole("super_admin");

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1>Admins</h1>
          <p className="text-muted-foreground mt-1">
            Manage building admins and their assignments.
          </p>
        </div>
      </div>

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <AdminsTable />
      </Suspense>
    </div>
  );
}

async function AdminsTable() {
  const supabase = await createClient();

  const [adminsRes, buildingsRes, assignmentsRes] = await Promise.all([
    supabase
      .from("bms_profiles")
      .select("id, email, full_name, phone, building_id, is_active, created_at")
      .eq("role", "admin")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("bms_buildings")
      .select("id, name, is_active")
      .order("name"),
    supabase
      .from("bms_admin_buildings")
      .select("profile_id, building_id, is_primary, bms_buildings(name)"),
  ]);

  const admins = adminsRes.data ?? [];
  const buildings = buildingsRes.data ?? [];
  const rawAssignments = assignmentsRes.data ?? [];
  const activeBuildings = buildings.filter((b) => b.is_active);
  const buildingMap = new Map(buildings.map((b) => [b.id, b.name]));

  // Build a map from profile_id -> list of assignments (with building name)
  type AssignmentEntry = { building_id: string; is_primary: boolean; building_name: string };
  const assignmentsByAdmin = new Map<string, AssignmentEntry[]>();
  for (const row of rawAssignments) {
    const existing = assignmentsByAdmin.get(row.profile_id) ?? [];
    const joinedBuilding = row.bms_buildings as unknown as { name: string } | { name: string }[] | null;
    const buildingName =
      (Array.isArray(joinedBuilding) ? joinedBuilding[0]?.name : joinedBuilding?.name) ??
      buildingMap.get(row.building_id) ??
      "Unknown";
    existing.push({
      building_id: row.building_id,
      is_primary: row.is_primary ?? false,
      building_name: buildingName,
    });
    assignmentsByAdmin.set(row.profile_id, existing);
  }

  return (
    <>
      <div className="flex justify-end">
        <AdminInviteButton
          buildings={activeBuildings.map((b) => ({ id: b.id, name: b.name }))}
        />
      </div>

      {adminsRes.error && (
        <div className="card-soft border-destructive/40 bg-destructive/5 text-destructive">
          Could not load admins. Please refresh — if the problem persists, contact support.
        </div>
      )}

      <div className="card-soft p-0 overflow-hidden mt-4">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold">Admin</th>
                <th className="px-4 py-3 text-sm font-semibold">Building(s)</th>
                <th className="px-4 py-3 text-sm font-semibold">Status</th>
                <th className="px-4 py-3 text-sm font-semibold">Joined</th>
                <th className="px-4 py-3 text-sm font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No admins yet. Click <strong>Create Admin</strong> to add one.
                  </td>
                </tr>
              )}
              {admins.map((a) => {
                const assignments = assignmentsByAdmin.get(a.id) ?? [];
                // Fall back to profile's building_id if junction table has no rows yet
                const displayBuilding =
                  assignments.length > 0
                    ? assignments.length === 1
                      ? assignments[0].building_name
                      : `${assignments.length} buildings`
                    : a.building_id
                      ? buildingMap.get(a.building_id) ?? "Unknown"
                      : null;

                return (
                  <tr key={a.id} className="border-t border-border hover:bg-secondary/50">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{a.full_name || a.email || "Unnamed"}</div>
                      <div className="text-xs text-muted-foreground">{a.email}</div>
                      {a.phone && (
                        <div className="text-xs text-muted-foreground">{a.phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {displayBuilding ? (
                          <span className="font-medium">{displayBuilding}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Unassigned</span>
                        )}
                        <div>
                          <AdminBuildingsDialog
                            adminId={a.id}
                            adminName={a.full_name || a.email || "Admin"}
                            currentAssignments={assignments}
                            allBuildings={activeBuildings.map((b) => ({ id: b.id, name: b.name }))}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {a.is_active ? (
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
                      {a.created_at ? formatDate(a.created_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <AdminRowActions
                        admin={{
                          id: a.id,
                          email: a.email,
                          full_name: a.full_name,
                          building_id: a.building_id,
                          is_active: !!a.is_active,
                        }}
                        buildings={activeBuildings.map((b) => ({ id: b.id, name: b.name }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
