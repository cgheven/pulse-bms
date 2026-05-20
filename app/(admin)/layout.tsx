import { Suspense } from "react";
import { AppShell, NavbarUserSkeleton } from "@/components/layout/app-shell";
import { NavbarUserServer } from "@/components/layout/navbar-user-server";
import { DemoBanner } from "@/components/layout/demo-banner";

/**
 * SYNC layout — renders shell instantly. Profile + building name stream into
 * the navbar via Suspense. Page-level requireRole runs inside the page's own
 * Suspense boundary, so the entire shell + sidebar appear in <50ms.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      role="admin"
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
