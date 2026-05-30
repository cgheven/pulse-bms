import { Suspense } from "react";
import { AppShell, NavbarUserSkeleton } from "@/components/layout/app-shell";
import { NavbarUserServer } from "@/components/layout/navbar-user-server";
import { DemoBanner } from "@/components/layout/demo-banner";
import { requireRole } from "@/lib/auth";

export default async function AccountantLayout({ children }: { children: React.ReactNode }) {
  await requireRole("accountant");
  return (
    <AppShell
      role="accountant"
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
