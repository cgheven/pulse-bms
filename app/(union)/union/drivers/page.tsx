import { requireRole } from "@/lib/auth";
import { DriversDirectory } from "@/components/drivers/drivers-directory";
import { loadDriverDirectory } from "@/components/drivers/load-directory";

export const dynamic = "force-dynamic";

export default async function UnionDriversPage() {
  const { profile } = await requireRole(["union", "admin"]);
  if (!profile.building_id) return null;

  const rows = await loadDriverDirectory(profile.building_id);

  return (
    <div className="space-y-5 animate-fade-up">
      <header>
        <h1>Drivers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Personal drivers recorded by residents in your building.
        </p>
      </header>
      <DriversDirectory rows={rows} />
    </div>
  );
}
