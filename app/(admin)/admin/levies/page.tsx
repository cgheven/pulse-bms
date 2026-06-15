import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { ensureRecurringDrafts } from "@/lib/levies-recurring";
import { formatCurrency, formatDate } from "@/lib/utils";
import { RecurringToggle } from "@/components/levies/recurring-toggle";
import Link from "next/link";
import { Plus, Landmark, ArrowRight, Repeat } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LeviesPage() {
  await requireRole(["admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) return null;

  const supabase = await createClient();

  // Lazily create this month's draft for any active recurring levy (idempotent).
  try {
    await ensureRecurringDrafts(supabase, buildingId);
  } catch (err) {
    console.error("ensureRecurringDrafts failed:", err);
  }

  const [{ data: templates }, { data: levies }] = await Promise.all([
    supabase
      .from("bms_levies")
      .select("id, name, description, total_cost, fund_contribution, due_date, is_active, created_at")
      .eq("building_id", buildingId)
      .eq("status", "template")
      .order("created_at", { ascending: false }),
    supabase
      .from("bms_levies")
      .select(
        "id, name, description, total_cost, fund_contribution, per_resident_amount, resident_count, is_recurring, parent_levy_id, due_date, status, created_at",
      )
      .eq("building_id", buildingId)
      .neq("status", "template")
      .order("created_at", { ascending: false }),
  ]);

  // Paid / total per levy for progress
  const { data: chargeStats } = levies?.length
    ? await supabase
        .from("bms_levy_charges")
        .select("levy_id, status")
        .in("levy_id", levies.map((l) => l.id))
    : { data: [] };

  const statsByLevy = new Map<string, { paid: number; total: number }>();
  for (const c of chargeStats ?? []) {
    const prev = statsByLevy.get(c.levy_id) ?? { paid: 0, total: 0 };
    statsByLevy.set(c.levy_id, {
      paid: prev.paid + (c.status === "paid" ? 1 : 0),
      total: prev.total + 1,
    });
  }

  const hasTemplates = (templates?.length ?? 0) > 0;
  const hasLevies = (levies?.length ?? 0) > 0;

  return (
    <div className="space-y-6 animate-fade-up">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1>Special Levies</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Shared building costs distributed to residents.
          </p>
        </div>
        <Link
          href="/admin/levies/new"
          className="btn-big btn-primary flex items-center gap-2 text-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Levy
        </Link>
      </div>

      {/* Recurring templates */}
      {hasTemplates && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Recurring (monthly)</h2>
          </div>
          {templates!.map((t) => (
            <div
              key={t.id}
              className="flex rounded-xl border border-border bg-card overflow-hidden"
            >
              <div className={`w-1 shrink-0 ${t.is_active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
              <div className="flex-1 flex items-center justify-between gap-4 px-4 py-3.5 min-w-0">
                <Link href={`/admin/levies/${t.id}`} className="min-w-0 group flex-1">
                  <p className="font-semibold text-foreground leading-none group-hover:text-primary transition-colors">
                    {t.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {formatCurrency(t.total_cost)}/mo · Fund covers{" "}
                    <span className="text-emerald-600 font-medium">
                      {formatCurrency(t.fund_contribution)}
                    </span>{" "}
                    · New draft is added each month
                  </p>
                </Link>
                <RecurringToggle levyId={t.id} isActive={t.is_active} />
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Regular list (one-time + monthly instances) */}
      <section className="space-y-2.5">
        {hasTemplates && hasLevies && (
          <h2 className="text-sm font-semibold">Levies</h2>
        )}

        {!hasLevies && !hasTemplates && (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center space-y-2">
            <Landmark className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">
              No levies yet.{" "}
              <Link href="/admin/levies/new" className="text-primary hover:underline font-medium">
                Create the first one.
              </Link>
            </p>
          </div>
        )}

        {levies?.map((levy) => {
          const stats = statsByLevy.get(levy.id);
          const paidPct =
            stats && stats.total > 0
              ? Math.round((stats.paid / stats.total) * 100)
              : 0;

          const accentColor =
            levy.status === "distributed"
              ? "bg-emerald-500"
              : levy.status === "cancelled"
                ? "bg-red-400"
                : "bg-amber-400";

          return (
            <Link
              key={levy.id}
              href={`/admin/levies/${levy.id}`}
              className="group flex rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all duration-150 overflow-hidden"
            >
              <div className={`w-1 shrink-0 ${accentColor}`} />

              <div className="flex-1 px-4 py-3.5 flex items-center justify-between gap-4 min-w-0">
                <div className="min-w-0 space-y-1.5">
                  {/* Name + badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground leading-none">
                      {levy.name}
                    </p>
                    <LevyStatusPill status={levy.status} />
                    {levy.parent_levy_id && (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-primary/8 text-primary px-1.5 py-0.5 rounded-full font-medium">
                        <Repeat className="w-2.5 h-2.5" />
                        Monthly
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {levy.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {levy.description}
                    </p>
                  )}

                  {/* Meta line */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {levy.per_resident_amount != null && (
                      <span>
                        Per resident:{" "}
                        <span className="font-medium text-foreground">
                          {formatCurrency(levy.per_resident_amount)}
                        </span>
                      </span>
                    )}
                    <span>Due {formatDate(levy.due_date)}</span>
                    {levy.resident_count != null && (
                      <span>{levy.resident_count} residents</span>
                    )}
                  </div>

                  {/* Collection progress */}
                  {levy.status === "distributed" && stats && stats.total > 0 && (
                    <div className="flex items-center gap-2 max-w-xs">
                      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${paidPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {stats.paid}/{stats.total} paid
                      </span>
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-lg font-bold tabular-nums">
                    {formatCurrency(levy.total_cost)}
                  </p>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all ml-auto" />
                </div>
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

function LevyStatusPill({ status }: { status: string }) {
  if (status === "distributed") return <span className="status-paid">Distributed</span>;
  if (status === "cancelled") return <span className="status-overdue">Cancelled</span>;
  return <span className="status-pending">Draft</span>;
}
