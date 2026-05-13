"use client";
import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import type { Profile } from "@/types";

/**
 * Legacy `nav` prop is accepted but ignored — sidebar now derives nav from `profile.role`.
 */
type LegacyNavItem = { href: string; label: string; icon?: React.ReactNode };

interface AppShellProps {
  profile: Profile;
  buildingName?: string | null;
  /** @deprecated Sidebar derives nav from role. Kept for compatibility. */
  nav?: LegacyNavItem[];
  children: React.ReactNode;
}

export function AppShell({ profile, buildingName, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        role={profile.role}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Navbar
          profile={profile}
          buildingName={buildingName}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
