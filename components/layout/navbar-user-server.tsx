import { redirect } from "next/navigation";
import { getSession, getCurrentBuildingName } from "@/lib/auth";
import { getAssignedBuildings, getActiveBuilding } from "@/lib/building-context";
import { NavbarUserClient } from "@/components/layout/app-shell";
import { BuildingSwitcher } from "@/components/layout/building-switcher";

/**
 * Server-side slot rendered inside <Suspense> in each role layout.
 * Resolves session + building name in parallel, then hands off to client
 * dropdown component. While this resolves, NavbarUserSkeleton is shown.
 *
 * For admin role: also resolves assigned buildings and active building so
 * the BuildingSwitcher can be rendered before the user avatar.
 */
export async function NavbarUserServer() {
  const [session, buildingName, buildings, activeBuildingId] = await Promise.all([
    getSession(),
    getCurrentBuildingName(),
    getAssignedBuildings(),
    getActiveBuilding(),
  ]);
  if (!session) redirect("/login");

  const isAdmin = session.profile.role === "admin";

  return (
    <>
      {isAdmin && buildings.length > 0 && (
        <BuildingSwitcher
          buildings={buildings}
          activeBuildingId={activeBuildingId}
          activeBuildingName={buildingName ?? ""}
        />
      )}
      <NavbarUserClient profile={session.profile} buildingName={isAdmin ? null : buildingName} />
    </>
  );
}
