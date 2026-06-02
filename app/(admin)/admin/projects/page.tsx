import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { loadBuildingProjects } from "@/lib/projects";
import { ProjectsIndex } from "@/components/projects/projects-index";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground">No building assigned.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const [projects, { data: proposalsRows }, flatsCount] = await Promise.all([
    loadBuildingProjects(buildingId),
    supabase
      .from("bms_proposals")
      .select("id, title")
      .eq("building_id", buildingId)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false }),
    supabase
      .from("bms_flats")
      .select("id", { count: "exact", head: true })
      .eq("building_id", buildingId),
  ]);

  return (
    <ProjectsIndex
      projects={projects}
      proposals={proposalsRows ?? []}
      totalFlats={flatsCount.count ?? 0}
      baseHref="/admin/projects"
      canCreate
    />
  );
}
