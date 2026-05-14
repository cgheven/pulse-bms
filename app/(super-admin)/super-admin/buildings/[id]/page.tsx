import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { formatLakh, formatCurrency, formatDate } from "@/lib/utils";
import { BuildingRowActions } from "@/components/super-admin/building-actions";

export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function BuildingDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  await requireRole("super_admin");
  const { id } = await params;
  const supabase = await createClient();

  const { data: building, error } = await supabase
    .from("bms_buildings")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !building) notFound();

  // Counts and admin lookup — parallel
  const [flatsRes, residentsRes, staffRes, adminsRes] = await Promise.all([
    supabase
      .from("bms_flats")
      .select("id", { count: "exact", head: true })
      .eq("building_id", id),
    supabase
      .from("bms_residents")
      .select("id", { count: "exact", head: true })
      .eq("building_id", id)
      .eq("is_active", true),
    supabase
      .from("bms_staff")
      .select("id", { count: "exact", head: true })
      .eq("building_id", id)
      .eq("is_active", true),
    supabase
      .from("bms_profiles")
      .select("id, email, full_name, is_active")
      .eq("building_id", id)
      .eq("role", "admin"),
  ]);

  const flatsCount = flatsRes.count ?? 0;
  const residentsCount = residentsRes.count ?? 0;
  const staffCount = staffRes.count ?? 0;
  const admins = adminsRes.data ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link
            href="/super-admin/buildings"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Buildings
          </Link>
          <h1 className="flex items-center gap-3">
            {building.name}
            {building.is_active ? (
              <span className="status-paid inline-flex px-2.5 py-0.5 text-xs rounded-full">
                Active
              </span>
            ) : (
              <span className="status-overdue inline-flex px-2.5 py-0.5 text-xs rounded-full">
                Inactive
              </span>
            )}
          </h1>
          {building.address && (
            <p className="text-muted-foreground mt-1">
              {building.address}
              {building.city ? `, ${building.city}` : ""}
            </p>
          )}
        </div>
        <BuildingRowActions building={building} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Total Flats</div>
          <div className="mt-2 text-3xl font-bold">{flatsCount}</div>
          <div className="text-xs text-muted-foreground mt-1">
            of {building.total_flats ?? 0} planned
          </div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Active Residents</div>
          <div className="mt-2 text-3xl font-bold">{residentsCount}</div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Active Staff</div>
          <div className="mt-2 text-3xl font-bold">{staffCount}</div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Fund Balance</div>
          <div className="mt-2 text-2xl font-bold">
            {formatLakh(Number(building.fund_balance ?? 0))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-soft">
          <h2 className="text-xl font-semibold mb-4">Union-managed settings</h2>
          <p className="text-sm text-muted-foreground mb-4 flex items-start gap-2">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>
              Fees, voting rule and utility cut-off are owned by the building&rsquo;s
              Union committee. Shown read-only for reference.
            </span>
          </p>
          <dl className="space-y-3 text-sm">
            <Row label="Voting Rule" value={building.voting_rule === "unanimous" ? "Unanimous" : "Majority"} />
            <Row
              label="Utility Cut-off"
              value={`${building.utility_cutoff_after_months ?? 3} months unpaid`}
            />
            <Row
              label="Entry Fee for Flat Purchase"
              value={formatCurrency(Number(building.entry_fee_owner ?? 0))}
            />
            <Row
              label="Entry Fee for Rent"
              value={formatCurrency(Number(building.entry_fee_tenant ?? 0))}
            />
            <Row
              label="Maintenance Fee"
              value={formatCurrency(Number(building.monthly_fee_default ?? 0))}
            />
            <Row label="Created" value={formatDate(building.created_at)} />
          </dl>
        </div>

        <div className="card-soft">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Assigned Admins</h2>
            <Link
              href="/super-admin/admins"
              className="text-primary text-sm font-medium hover:underline"
            >
              Manage admins
            </Link>
          </div>
          {admins.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No admin assigned to this building yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {admins.map(
                (a: { id: string; email: string | null; full_name: string | null; is_active: boolean }) => (
                  <li key={a.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {a.full_name || a.email || "Unnamed"}
                      </div>
                      {a.full_name && (
                        <div className="text-xs text-muted-foreground">{a.email}</div>
                      )}
                    </div>
                    {a.is_active ? (
                      <span className="status-paid inline-flex px-2.5 py-0.5 text-xs rounded-full">
                        Active
                      </span>
                    ) : (
                      <span className="status-overdue inline-flex px-2.5 py-0.5 text-xs rounded-full">
                        Inactive
                      </span>
                    )}
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}
