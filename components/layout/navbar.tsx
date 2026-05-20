"use client";
import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu, LogOut, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type Profile } from "@/types";

interface NavbarProps {
  onMenuClick: () => void;
  profile: Profile;
  buildingName?: string | null;
}

/**
 * Derive a friendly page title from the pathname.
 *   /admin                 → "Dashboard"
 *   /admin/maintenance     → "Maintenance"
 *   /admin/flats/abc-123   → "Flats"
 *   /super-admin           → "Dashboard"
 *   /resident              → "Home"
 */
function deriveTitle(pathname: string, role: string): string {
  const segments = pathname.split("/").filter(Boolean);
  // First segment is the role group. If only the role segment is present,
  // resident shows "Home", everyone else shows "Dashboard".
  if (segments.length <= 1) {
    return role === "resident" ? "Home" : "Dashboard";
  }
  const last = segments[1]; // second segment is the page
  return last
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function Navbar({ onMenuClick, profile, buildingName }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const initials = useMemo(() => {
    const src = profile.full_name ?? profile.email ?? "U";
    return src
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }, [profile.full_name, profile.email]);

  const title = useMemo(() => deriveTitle(pathname, profile.role), [pathname, profile.role]);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 h-16 bg-sidebar/90 backdrop-blur-md border-b border-sidebar-border">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Title / building name */}
      <div className="flex flex-col min-w-0">
        <p className="font-semibold text-base text-foreground leading-none truncate">
          {title}
        </p>
        {buildingName && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {buildingName}
          </p>
        )}
      </div>

      {/* User menu */}
      <div className="ml-auto flex items-center gap-2 relative">
        <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 border border-primary/20">
          {ROLE_LABELS[profile.role]}
        </span>

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
              dropOpen && "rotate-180"
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
    </header>
  );
}
