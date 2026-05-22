import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadBuildingProjects } from "@/lib/projects";
import { ProjectsIndex } from "@/components/projects/projects-index";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground">No building assigned.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const [projects, { data: proposalsRows }, flatsCount] = await Promise.all([
    loadBuildingProjects(profile.building_id),
    supabase
      .from("bms_proposals")
      .select("id, title")
      .eq("building_id", profile.building_id)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false }),
    supabase
      .from("bms_flats")
      .select("id", { count: "exact", head: true })
      .eq("building_id", profile.building_id),
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
