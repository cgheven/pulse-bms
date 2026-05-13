import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const [{ profile }, buildingName] = await Promise.all([
    requireRole("resident"),
    getCurrentBuildingName(),
  ]);
  return (
    <AppShell profile={profile} buildingName={buildingName}>
      {children}
    </AppShell>
  );
}
