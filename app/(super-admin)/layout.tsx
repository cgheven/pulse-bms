import { Suspense } from "react";
import { AppShell, NavbarUserSkeleton } from "@/components/layout/app-shell";
import { NavbarUserServer } from "@/components/layout/navbar-user-server";
import { DemoBanner } from "@/components/layout/demo-banner";
import { getSession } from "@/lib/auth";

/**
 * Adapts the shell's sidebar to the LOGGED-IN profile's role so sales
 * team members (role='sales') get a minimal Leads-only sidebar inside
 * this route group, instead of the full super_admin nav. Defaults to
 * super_admin when the session is missing so the layout renders during
 * SSR before redirects fire.
 */
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const role = session?.profile.role ?? "super_admin";
  return (
    <AppShell
      role={role}
      navbarUser={
        <Suspense fallback={<NavbarUserSkeleton />}>
          <NavbarUserServer />
        </Suspense>
      }
      demoBanner={
        <Suspense fallback={null}>
          <DemoBanner />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
