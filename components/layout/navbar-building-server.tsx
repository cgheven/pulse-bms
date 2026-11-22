import { getCurrentBuildingName } from "@/lib/auth";
import { getAssignedBuildings, getActiveBuilding } from "@/lib/building-context";
import { BuildingSwitcher } from "@/components/layout/building-switcher";

/**
 * Left-of-header building identity — the HMS-style switcher (icon chip + name
 * + chevron). Streams in via <Suspense> from the admin layout. All three reads
 * are React.cache()-wrapped, so they dedupe with the same calls elsewhere in
 * the request (no extra DB hits).
 */
export async function NavbarBuildingServer() {
  const [buildingName, buildings, activeBuildingId] = await Promise.all([
    getCurrentBuildingName(),
    getAssignedBuildings(),
    getActiveBuilding(),
  ]);

  if (!buildingName && buildings.length === 0) return null;

  return (
    <BuildingSwitcher
      buildings={buildings}
      activeBuildingId={activeBuildingId}
      activeBuildingName={buildingName ?? ""}
    />
  );
}
