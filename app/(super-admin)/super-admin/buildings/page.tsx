import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { formatLakh } from "@/lib/utils";
import {
  BuildingRowActions,
  CreateBuildingButton,
} from "@/components/super-admin/building-actions";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

type BuildingRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  total_flats: number;
  flat_limit: number;
  fund_balance: number;
  entry_fee_owner: number;
  entry_fee_tenant: number;
  monthly_fee_default: number;
  voting_rule: "majority" | "unanimous";
  utility_cutoff_after_months: number;
  is_active: boolean;
};

export default async function BuildingsListPage() {
  await requireRole("super_admin");

  const supabase = await createClient();
  const { data: adminProfiles } = await supabase
    .from("bms_profiles")
    .select("id, full_name, email")
    .eq("role", "admin")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  const admins = (adminProfiles ?? []).map((a) => ({
    id: a.id,
    label: a.full_name || a.email || a.id,
  }));

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1>Buildings</h1>
          <p className="text-muted-foreground mt-1">
            Manage all buildings under Pulse BMS.
          </p>
        </div>
        <CreateBuildingButton admins={admins} />
      </div>

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <BuildingsTable />
      </Suspense>
    </div>
  );
}

async function BuildingsTable() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bms_buildings")
    .select(
      "id, name, address, city, total_flats, flat_limit, fund_balance, entry_fee_owner, entry_fee_tenant, monthly_fee_default, voting_rule, utility_cutoff_after_months, is_active"
    )
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  const buildings: BuildingRow[] = (data ?? []) as BuildingRow[];

  return (
    <>
      {error && (
        <div className="card-soft border-destructive/40 bg-destructive/5 text-destructive">
          Could not load buildings. Please refresh — if the problem persists, contact support.
        </div>
      )}

      <div className="card-soft p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold">Building</th>
                <th className="px-4 py-3 text-sm font-semibold">City</th>
                <th className="px-4 py-3 text-sm font-semibold text-right">Flats / Limit</th>
                <th className="px-4 py-3 text-sm font-semibold text-right">Fund Balance</th>
                <th className="px-4 py-3 text-sm font-semibold">Status</th>
                <th className="px-4 py-3 text-sm font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {buildings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No buildings yet. Click <strong>Add Building</strong> to get started.
                  </td>
                </tr>
              )}
              {buildings.map((b) => (
                <tr key={b.id} className="border-t border-border hover:bg-secondary/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/super-admin/buildings/${b.id}`}
                      className="font-semibold text-foreground hover:text-primary"
                    >
                      {b.name}
                    </Link>
                    {b.address && (
                      <div className="text-xs text-muted-foreground mt-0.5">{b.address}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">{b.city ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {b.total_flats ?? 0}
                    <span className="text-muted-foreground text-xs"> / {b.flat_limit}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatLakh(Number(b.fund_balance ?? 0))}
                  </td>
                  <td className="px-4 py-3">
                    {b.is_active ? (
                      <span className="status-paid inline-flex px-2.5 py-0.5 text-xs rounded-full">
                        Active
                      </span>
                    ) : (
                      <span className="status-overdue inline-flex px-2.5 py-0.5 text-xs rounded-full">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <BuildingRowActions building={b} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
