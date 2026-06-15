import { requireRole } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { DriversDirectory } from "@/components/drivers/drivers-directory";
import { loadDriverDirectory } from "@/components/drivers/load-directory";

export const dynamic = "force-dynamic";

export default async function AdminDriversPage() {
  await requireRole(["admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) return null;

  const rows = await loadDriverDirectory(buildingId);

  return (
    <div className="space-y-5 animate-fade-up">
      <header>
        <h1>Drivers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Personal drivers recorded by residents. Residents maintain these
          records from their own portal.
        </p>
      </header>
      <DriversDirectory rows={rows} />
    </div>
  );
}
