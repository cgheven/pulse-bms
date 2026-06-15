import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { notFound } from "next/navigation";
import { LevyDetailClient } from "@/components/levies/levy-detail-client";
import { RecurringToggle } from "@/components/levies/recurring-toggle";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, Repeat } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LevyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin"]);
  const { id } = await params;
  const buildingId = await getActiveBuilding();
  if (!buildingId) return notFound();

  const supabase = await createClient();
  const { data: levy } = await supabase
    .from("bms_levies")
    .select(
      "id, name, description, total_cost, fund_contribution, per_resident_amount, resident_count, is_recurring, recurrence_day, due_date, status, distributed_at, is_active",
    )
    .eq("id", id)
    .eq("building_id", buildingId)
    .single();

  if (!levy) return notFound();

  // ── Recurring template view ──────────────────────────────────────────────
  if (levy.status === "template") {
    const [{ data: instances }, { count: activeResidents }] = await Promise.all([
      supabase
        .from("bms_levies")
        .select("id, name, total_cost, per_resident_amount, due_date, status, billing_month")
        .eq("parent_levy_id", id)
        .eq("building_id", buildingId)
        .order("billing_month", { ascending: false }),
      supabase
        .from("bms_residents")
        .select("id", { count: "exact", head: true })
        .eq("building_id", buildingId)
        .eq("is_active", true),
    ]);

    const residentShare =
      Number(levy.total_cost) - Number(levy.fund_contribution);
    const headcount = activeResidents ?? 0;
    const perResidentEst =
      residentShare > 0 && headcount > 0
        ? formatCurrency(residentShare / headcount)
        : residentShare <= 0
          ? "Rs. 0"
          : "—";

    return (
      <div className="space-y-5 animate-fade-up">
        <div className="flex items-start gap-3">
          <Link
            href="/admin/levies"
            className="text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1>{levy.name}</h1>
              <span className="inline-flex items-center gap-1 text-[11px] bg-primary/8 text-primary px-2 py-0.5 rounded-full font-medium">
                <Repeat className="w-2.5 h-2.5" />
                Recurring monthly
              </span>
            </div>
            {levy.description && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {levy.description}
              </p>
            )}
          </div>
        </div>

        {/* Status + toggle */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
          <div>
            <p className="text-sm font-medium">
              {levy.is_active ? "Active — generating monthly drafts" : "Paused"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {levy.is_active
                ? "A new draft is added each month for you to review and send."
                : "No new monthly drafts will be created until you turn this back on."}
            </p>
          </div>
          <RecurringToggle levyId={levy.id} isActive={levy.is_active} hideLabel />
        </div>

        {/* Template figures */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Stat label="Monthly cost" value={formatCurrency(levy.total_cost)} />
          <Stat label="Fund covers" value={formatCurrency(levy.fund_contribution)} valueClass="text-emerald-600" />
          <Stat label="Resident share" value={formatCurrency(residentShare)} valueClass={residentShare > 0 ? "text-amber-600" : "text-foreground"} />
          <Stat label="Per resident (est.)" value={perResidentEst} valueClass="text-primary" />
        </div>

        {/* Generated months */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Monthly history</h2>
          {!instances || instances.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              No months generated yet.
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
              {instances.map((m) => (
                <Link
                  key={m.id}
                  href={`/admin/levies/${m.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {m.billing_month
                        ? new Date(`${m.billing_month}T00:00:00Z`).toLocaleDateString("en-US", {
                            month: "long",
                            year: "numeric",
                            timeZone: "UTC",
                          })
                        : m.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Due {formatDate(m.due_date)}
                      {m.per_resident_amount != null
                        ? ` · ${formatCurrency(m.per_resident_amount)}/resident`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <InstanceStatusPill status={m.status} />
                    <span className="text-sm font-semibold tabular-nums">
                      {formatCurrency(m.total_cost)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // ── One-time / monthly-instance view ─────────────────────────────────────
  const [{ data: charges }, { count: activeResidents }] = await Promise.all([
    supabase
      .from("bms_levy_charges")
      .select(
        "id, amount, due_date, status, paid_at, bms_residents(full_name), bms_flats(flat_number)",
      )
      .eq("levy_id", id)
      .eq("building_id", buildingId)
      .order("status")
      .order("created_at"),
    supabase
      .from("bms_residents")
      .select("id", { count: "exact", head: true })
      .eq("building_id", buildingId)
      .eq("is_active", true),
  ]);

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start gap-3">
        <Link
          href="/admin/levies"
          className="text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1>{levy.name}</h1>
          {levy.description && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {levy.description}
            </p>
          )}
        </div>
      </div>

      <LevyDetailClient
        levy={levy}
        charges={(charges ?? []) as Parameters<typeof LevyDetailClient>[0]["charges"]}
        activeResidentCount={activeResidents ?? 0}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass = "text-foreground",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-base sm:text-lg font-semibold tracking-tight tabular-nums break-words ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

function InstanceStatusPill({ status }: { status: string }) {
  if (status === "distributed") return <span className="status-paid">Distributed</span>;
  if (status === "cancelled") return <span className="status-overdue">Cancelled</span>;
  return <span className="status-pending">Draft</span>;
}
