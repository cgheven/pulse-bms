import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [{ profile }, buildingName] = await Promise.all([
    requireRole(["admin", "super_admin"]),
    getCurrentBuildingName(),
  ]);
  return (
    <AppShell profile={profile} buildingName={buildingName}>
      {children}
    </AppShell>
  );
}
