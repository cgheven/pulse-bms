import { redirect } from "next/navigation";
import { getSession, getCurrentBuildingName } from "@/lib/auth";
import { NavbarUserClient } from "@/components/layout/app-shell";

/**
 * Server-side slot rendered inside <Suspense> in each role layout.
 * Resolves session + building name in parallel, then hands off to client
 * dropdown component. While this resolves, NavbarUserSkeleton is shown.
 */
export async function NavbarUserServer() {
  const [session, buildingName] = await Promise.all([
    getSession(),
    getCurrentBuildingName(),
  ]);
  if (!session) redirect("/login");
  return (
    <NavbarUserClient profile={session.profile} buildingName={buildingName} />
  );
}
