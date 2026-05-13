import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

export default async function UnionLayout({ children }: { children: React.ReactNode }) {
  const [{ profile }, buildingName] = await Promise.all([
    requireRole("union"),
    getCurrentBuildingName(),
  ]);
  return (
    <AppShell profile={profile} buildingName={buildingName}>
      {children}
    </AppShell>
  );
}
