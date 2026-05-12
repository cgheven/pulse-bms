import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { AdminInviteButton } from "@/components/super-admin/admin-invite-dialog";
import { AdminRowActions } from "@/components/super-admin/admin-row-actions";

export const dynamic = "force-dynamic";

export default async function AdminsListPage() {
  await requireRole("super_admin");
  const supabase = await createClient();

  const [adminsRes, buildingsRes] = await Promise.all([
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
  ]);

  const admins = adminsRes.data ?? [];
  const buildings = buildingsRes.data ?? [];
  const activeBuildings = buildings.filter((b) => b.is_active);
  const buildingMap = new Map(buildings.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1>Admins</h1>
          <p className="text-muted-foreground mt-1">
            Manage building admins and their assignments.
          </p>
        </div>
        <AdminInviteButton
          buildings={activeBuildings.map((b) => ({ id: b.id, name: b.name }))}
        />
      </div>

      {adminsRes.error && (
        <div className="card-soft border-destructive/40 bg-destructive/5 text-destructive">
          Could not load admins: {adminsRes.error.message}
        </div>
      )}

      <div className="card-soft p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold">Admin</th>
                <th className="px-4 py-3 text-sm font-semibold">Building</th>
                <th className="px-4 py-3 text-sm font-semibold">Status</th>
                <th className="px-4 py-3 text-sm font-semibold">Joined</th>
                <th className="px-4 py-3 text-sm font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No admins yet. Click <strong>Invite Admin</strong> to add one.
                  </td>
                </tr>
              )}
              {admins.map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-secondary/50">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{a.full_name || a.email || "Unnamed"}</div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                    {a.phone && (
                      <div className="text-xs text-muted-foreground">{a.phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.building_id ? (
                      <span className="font-medium">
                        {buildingMap.get(a.building_id) ?? "Unknown"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">Unassigned</span>
                    )}
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
