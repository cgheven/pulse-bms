import { Suspense } from "react";
import { AppShell, NavbarUserSkeleton } from "@/components/layout/app-shell";
import { NavbarUserServer } from "@/components/layout/navbar-user-server";
import { DemoBanner } from "@/components/layout/demo-banner";
import { getSession } from "@/lib/auth";

/**
 * Adapts the shell's sidebar to the LOGGED-IN profile's role rather than
 * the route group's hardcoded "admin". Union users can hit /admin/reports
 * (shared module) and still see their own sidebar. `getSession` is
 * React.cache()-wrapped so this awaits a request-scoped lookup, not a
 * fresh DB hit.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const role = session?.profile.role ?? "admin";
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
