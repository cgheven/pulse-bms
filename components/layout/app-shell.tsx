import Link from "next/link";
import { Building2, LogOut } from "lucide-react";
import { ROLE_LABELS, type Profile } from "@/types";
import { SignOutButton } from "./sign-out-button";

type NavItem = { href: string; label: string; icon?: React.ReactNode };

export function AppShell({
  profile,
  buildingName,
  nav,
  children,
}: {
  profile: Profile;
  buildingName?: string | null;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-secondary">
      <header className="bg-white border-b border-border sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-primary" />
            <div>
              <div className="font-bold text-lg leading-tight">Pulse BMS</div>
              {buildingName && (
                <div className="text-xs text-muted-foreground leading-tight">{buildingName}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold">{profile.full_name ?? profile.email}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABELS[profile.role]}</div>
            </div>
            <SignOutButton />
          </div>
        </div>

        <nav className="max-w-7xl mx-auto px-6 flex gap-1 overflow-x-auto border-t border-border">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-4 py-3 text-base font-medium text-muted-foreground hover:text-foreground hover:bg-secondary border-b-2 border-transparent hover:border-primary/40 transition-colors whitespace-nowrap"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
