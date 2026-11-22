import { redirect } from "next/navigation";
import { getSession, getCurrentBuildingName } from "@/lib/auth";
import { NavbarUserClient } from "@/components/layout/app-shell";

/**
 * Right-of-header user slot rendered inside <Suspense> in each role layout.
 * Resolves session + building name, then hands off to the client dropdown.
 *
 * The admin building switcher now lives on the LEFT of the header
 * (NavbarBuildingServer), so it is no longer rendered here — admins get no
 * building name on the right (it would duplicate the switcher); other roles
 * still show their building name beside the avatar.
 */
export async function NavbarUserServer() {
  const [session, buildingName] = await Promise.all([
    getSession(),
    getCurrentBuildingName(),
  ]);
  if (!session) redirect("/login");

  const isAdmin = session.profile.role === "admin";

  return (
    <NavbarUserClient profile={session.profile} buildingName={isAdmin ? null : buildingName} />
  );
}
