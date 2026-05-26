"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu, LogOut, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type Role, type Profile } from "@/types";
import { Sidebar } from "@/components/layout/sidebar";

interface AppShellProps {
  /** Known from the route group — passed directly. No auth await needed for shell render. */
  role: Role;
  /** Server-rendered slot for user info — streams in via Suspense in the layout. */
  navbarUser: React.ReactNode;
  /**
   * Optional server-rendered demo banner. Streams in via Suspense from each
   * role layout. Renders null for non-demo sessions, so we just slot it in
   * unconditionally above the header.
   */
  demoBanner?: React.ReactNode;
  children: React.ReactNode;
}

function deriveTitle(pathname: string, role: Role): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return role === "resident" ? "Home" : "Dashboard";
  }
  const last = segments[1];
  return last
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Top-level shell. Sync — renders sidebar + chrome instantly.
 * Profile + building name are streamed into the `navbarUser` slot via Suspense
 * at the layout level.
 */
export function AppShell({ role, navbarUser, demoBanner, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const title = deriveTitle(pathname, role);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        role={role}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Demo strip — renders null when the session isn't a demo account. */}
        {demoBanner}
        <header className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 h-16 bg-sidebar border-b border-sidebar-border">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Static title from pathname — renders instantly, no auth wait */}
          <div className="flex flex-col min-w-0">
            <p className="font-semibold text-base text-foreground leading-none truncate">
              {title}
            </p>
            {/* building name streams in via the navbarUser slot's NavbarBuildingName */}
          </div>

          {/* User info streams in here — server slot wrapped in Suspense at layout */}
          <div className="ml-auto flex items-center gap-2">{navbarUser}</div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Client-side user dropdown — receives profile from server slot.
 * ───────────────────────────────────────────────────────────────────────── */
export function NavbarUserClient({
  profile,
  buildingName,
}: {
  profile: Profile;
  buildingName: string | null;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const src = profile.full_name ?? profile.email ?? "U";
  const initials = src
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Building name (subtitle under title) — handled in the same right cluster */}
      {buildingName && (
        <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[160px] mr-3">
          {buildingName}
        </span>
      )}

      <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 border border-primary/20">
        {ROLE_LABELS[profile.role]}
      </span>

      <div className="relative">
        <button
          onClick={() => setDropOpen((p) => !p)}
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors group"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 border border-primary/25 text-primary text-xs font-bold">
            {initials}
          </div>
          <span className="hidden sm:block text-sm text-muted-foreground group-hover:text-foreground transition-colors truncate max-w-[140px]">
            {profile.full_name ?? profile.email ?? "User"}
          </span>
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
              dropOpen && "rotate-180",
            )}
          />
        </button>

        {dropOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setDropOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-56 z-20 rounded-xl border border-sidebar-border bg-sidebar shadow-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-sidebar-border">
                <p className="text-sm font-medium text-foreground truncate">
                  {profile.full_name ?? "User"}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {profile.email ?? ""}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mt-1.5">
                  {ROLE_LABELS[profile.role]}
                </p>
              </div>
              <div className="p-1">
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  <LogOut className="w-4 h-4" />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Skeleton fallback while NavbarUserClient profile loads.
 * ───────────────────────────────────────────────────────────────────────── */
export function NavbarUserSkeleton() {
  return (
    <>
      <span className="hidden sm:inline-block w-24 h-3 rounded bg-secondary/50 animate-pulse mr-3" />
      <span className="hidden md:inline-block w-12 h-5 rounded-md bg-secondary/60 animate-pulse" />
      <div className="flex items-center gap-2.5 px-2.5 py-1.5">
        <div className="w-8 h-8 rounded-full bg-secondary/60 animate-pulse" />
        <span className="hidden sm:inline-block w-24 h-3 rounded bg-secondary/50 animate-pulse" />
      </div>
    </>
  );
}
