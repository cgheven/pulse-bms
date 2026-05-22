import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  loadProjectStandings,
  loadProjectContributions,
  type ProjectRow,
  type ProjectSummary,
} from "@/lib/projects";
import { ProjectDetailClient } from "@/components/admin/projects/project-detail-client";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

// OUTER sync server component — paints the page shell instantly on nav.
// All data work happens inside the Suspense boundary so the chrome feels
// pre-warmed, mirroring the Reports module pattern.
export default function AdminProjectDetailPage({
  params,
}: {
  params: Params;
}) {
  return (
    <div className="space-y-6 animate-fade-up">
      <Suspense fallback={<DetailSkeleton />}>
        <Inner params={params} />
      </Suspense>
    </div>
  );
}

async function Inner({ params }: { params: Params }) {
  const { id } = await params;
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground">No building assigned.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("bms_projects")
    .select("*")
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .maybeSingle();
  if (!project) notFound();

  const row = project as ProjectRow;

  // Aggregate the data + KPIs in parallel.
  const [standings, contributions, flatsCountRes, { data: flats }, { data: payments }, { data: proposal }, { data: creator }, { data: shareRows }] =
    await Promise.all([
      loadProjectStandings(row),
      loadProjectContributions(row),
      supabase
        .from("bms_flats")
        .select("id", { count: "exact", head: true })
        .eq("building_id", profile.building_id),
      supabase
        .from("bms_flats")
        .select("id, flat_number, outstanding_dues")
        .eq("building_id", profile.building_id)
        .order("flat_number", { ascending: true }),
      supabase
        .from("bms_payments")
        .select("flat_id, amount")
        .eq("project_id", row.id)
        .eq("building_id", profile.building_id),
      row.proposal_id
        ? supabase
            .from("bms_proposals")
            .select("title")
            .eq("id", row.proposal_id)
            .eq("building_id", profile.building_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      row.created_by
        ? supabase
            .from("bms_profiles")
            .select("full_name, email")
            .eq("id", row.created_by)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // For equal-rule projects: count flats added AFTER project start that
      // still have no share row. Drives the "Sync shares" button in About.
      row.contribution_rule === "equal"
        ? supabase
            .from("bms_project_shares")
            .select("flat_id")
            .eq("project_id", row.id)
        : Promise.resolve({ data: [] }),
    ]);

  const buildingName = (await getCurrentBuildingName()) ?? "Building";

  // Aggregate to ProjectSummary
  const collected = (payments ?? []).reduce(
    (s, p) => s + Number((p as { amount: number }).amount ?? 0),
    0,
  );
  const paidByFlat = new Map<string, number>();
  for (const p of payments ?? []) {
    const fid = (p as { flat_id: string | null }).flat_id;
    if (!fid) continue;
    paidByFlat.set(
      fid,
      (paidByFlat.get(fid) ?? 0) + Number((p as { amount: number }).amount ?? 0),
    );
  }

  const totalFlatsInBuilding = flatsCountRes.count ?? 0;
  const target = row.target_amount != null ? Number(row.target_amount) : null;
  const today = new Date();
  const daysRemaining = row.end_date
    ? Math.ceil(
        (new Date(row.end_date).getTime() - today.getTime()) / 86_400_000,
      )
    : null;

  const summary: ProjectSummary = {
    ...row,
    target_amount: target,
    default_per_flat:
      row.default_per_flat != null ? Number(row.default_per_flat) : null,
    collected,
    contributors: paidByFlat.size,
    total_flats:
      row.contribution_rule === "voluntary"
        ? totalFlatsInBuilding
        : standings.length > 0
        ? standings.length
        : totalFlatsInBuilding,
    paid_in_full: standings.filter((s) => s.status === "paid").length,
    pending: standings.filter((s) => s.status !== "paid").length,
    days_remaining: daysRemaining,
    progress: target && target > 0 ? Math.min(1, collected / target) : null,
  };

  const flatOptions = (flats ?? []).map((f) => ({
    id: f.id,
    flat_number: f.flat_number,
    outstanding_dues: Number(f.outstanding_dues ?? 0),
  }));

  // Count flats with no share row (equal-rule only — empty array otherwise
  // so the count is 0 and the Sync UI stays hidden).
  const shareFlatIds = new Set(
    (shareRows ?? []).map((s) => (s as { flat_id: string }).flat_id),
  );
  const missingSharesCount =
    row.contribution_rule === "equal"
      ? (flats ?? []).filter((f) => !shareFlatIds.has(f.id)).length
      : 0;

  return (
    <ProjectDetailClient
      project={summary}
      standings={standings}
      contributions={contributions}
      flats={flatOptions}
      buildingName={buildingName}
      buildingId={profile.building_id}
      baseHref="/admin/projects"
      proposalTitle={(proposal as { title: string } | null)?.title ?? null}
      createdByName={
        (creator as { full_name: string | null; email: string | null } | null)
          ?.full_name ??
        (creator as { email: string | null } | null)?.email ??
        null
      }
      canManage
      missingSharesCount={missingSharesCount}
    />
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-4 w-32 rounded bg-muted/40 animate-pulse" />
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="space-y-2">
          <div className="h-4 w-24 rounded bg-muted/40 animate-pulse" />
          <div className="h-8 w-72 rounded bg-muted/40 animate-pulse" />
        </div>
        <div className="h-6 w-full rounded-full bg-muted/40 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="h-10 w-72 rounded-lg bg-muted/40 animate-pulse" />
      <div className="card-soft h-72 animate-pulse" />
    </div>
  );
}
