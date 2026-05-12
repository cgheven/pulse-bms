import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { AuditFilters } from "@/components/super-admin/audit-filters";
import { AuditMetaCell } from "@/components/super-admin/audit-row";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SP = Record<string, string | string[] | undefined>;

function pickString(sp: SP, key: string): string | undefined {
  const v = sp[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

type AuditEntry = {
  id: number;
  created_at: string;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  building_id: string | null;
  meta: unknown;
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireRole("super_admin");
  const sp = await searchParams;
  const supabase = await createClient();

  const buildingFilter = pickString(sp, "building");
  const entityFilter = pickString(sp, "entity");
  const actorFilter = pickString(sp, "actor");
  const fromFilter = pickString(sp, "from");
  const toFilter = pickString(sp, "to");
  const page = Math.max(1, Number(pickString(sp, "page") ?? "1") || 1);

  const fromIdx = (page - 1) * PAGE_SIZE;
  const toIdx = fromIdx + PAGE_SIZE - 1;

  let query = supabase
    .from("bms_audit_log")
    .select(
      "id, created_at, actor_email, actor_role, action, entity, entity_id, building_id, meta",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(fromIdx, toIdx);

  if (buildingFilter) query = query.eq("building_id", buildingFilter);
  if (entityFilter) query = query.eq("entity", entityFilter);
  if (actorFilter) query = query.ilike("actor_email", `%${actorFilter}%`);
  if (fromFilter) query = query.gte("created_at", `${fromFilter}T00:00:00Z`);
  if (toFilter) query = query.lte("created_at", `${toFilter}T23:59:59Z`);

  const [logsRes, buildingsRes, entitiesRes] = await Promise.all([
    query,
    supabase.from("bms_buildings").select("id, name").order("name"),
    supabase
      .from("bms_audit_log")
      .select("entity")
      .limit(500)
      .order("created_at", { ascending: false }),
  ]);

  const logs: AuditEntry[] = (logsRes.data ?? []) as AuditEntry[];
  const total = logsRes.count ?? 0;
  const buildings = buildingsRes.data ?? [];
  const buildingMap = new Map(buildings.map((b) => [b.id, b.name]));
  const entities = Array.from(
    new Set((entitiesRes.data ?? []).map((r: { entity: string }) => r.entity))
  ).sort();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseSP = new URLSearchParams();
  if (buildingFilter) baseSP.set("building", buildingFilter);
  if (entityFilter) baseSP.set("entity", entityFilter);
  if (actorFilter) baseSP.set("actor", actorFilter);
  if (fromFilter) baseSP.set("from", fromFilter);
  if (toFilter) baseSP.set("to", toFilter);

  const prevHref = page > 1 ? buildHref(baseSP, page - 1) : null;
  const nextHref = page < totalPages ? buildHref(baseSP, page + 1) : null;

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1>Audit Log</h1>
        <p className="text-muted-foreground mt-1">
          Every change in Pulse BMS — searchable, immutable.
        </p>
      </div>

      <AuditFilters buildings={buildings} entities={entities} />

      {logsRes.error && (
        <div className="card-soft border-destructive/40 bg-destructive/5 text-destructive">
          Could not load audit log: {logsRes.error.message}
        </div>
      )}

      <div className="card-soft p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold whitespace-nowrap">When</th>
                <th className="px-4 py-3 text-sm font-semibold">Actor</th>
                <th className="px-4 py-3 text-sm font-semibold">Action</th>
                <th className="px-4 py-3 text-sm font-semibold">Entity</th>
                <th className="px-4 py-3 text-sm font-semibold">Building</th>
                <th className="px-4 py-3 text-sm font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No audit entries match the current filters.
                  </td>
                </tr>
              )}
              {logs.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{formatTime(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm">{r.actor_email ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.actor_role ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-3 text-sm">
                    {r.entity}
                    {r.entity_id && (
                      <div className="text-xs text-muted-foreground font-mono break-all">
                        {r.entity_id.slice(0, 8)}…
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.building_id ? buildingMap.get(r.building_id) ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <AuditMetaCell meta={r.meta} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-secondary/40">
          <div className="text-sm text-muted-foreground">
            {total === 0
              ? "0 entries"
              : `Showing ${fromIdx + 1}–${Math.min(fromIdx + PAGE_SIZE, total)} of ${total}`}
          </div>
          <div className="flex items-center gap-2">
            {prevHref ? (
              <Link
                href={prevHref}
                className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-secondary"
              >
                ← Previous
              </Link>
            ) : (
              <span className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground opacity-60">
                ← Previous
              </span>
            )}
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            {nextHref ? (
              <Link
                href={nextHref}
                className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-secondary"
              >
                Next →
              </Link>
            ) : (
              <span className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground opacity-60">
                Next →
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildHref(base: URLSearchParams, page: number) {
  const sp = new URLSearchParams(base);
  sp.set("page", String(page));
  return `/super-admin/audit?${sp.toString()}`;
}
