import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

const NAV = [
  { href: "/super-admin",            label: "Dashboard" },
  { href: "/super-admin/buildings",  label: "Buildings" },
  { href: "/super-admin/admins",     label: "Admins" },
  { href: "/super-admin/audit",      label: "Audit Log" },
];

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("super_admin");
  return <AppShell profile={profile} nav={NAV}>{children}</AppShell>;
}
