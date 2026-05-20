import { Suspense } from "react";
import { AppShell, NavbarUserSkeleton } from "@/components/layout/app-shell";
import { NavbarUserServer } from "@/components/layout/navbar-user-server";
import { DemoBanner } from "@/components/layout/demo-banner";

export default function UnionLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      role="union"
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
