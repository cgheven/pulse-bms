import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/types";
import { ROLE_HOME } from "@/types";

/**
 * Session resolver.
 *
 * Wrapped in React.cache() so layout + page + nested components share ONE
 * Supabase round-trip per request. Uses auth.getUser() (validates the token
 * with Supabase's auth server) — matches Supabase's recommended SSR pattern.
 * The cache ensures we don't repeat the network call within a single render.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("bms_profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return profile ? { user, profile: profile as Profile } : null;
});

export async function requireSession() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireRole(allowed: Role | Role[]) {
  const s = await requireSession();
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(s.profile.role)) {
    redirect(ROLE_HOME[s.profile.role]);
  }
  return s;
}

export async function requireBuilding() {
  const s = await requireSession();
  if (!s.profile.building_id && s.profile.role !== "super_admin") {
    redirect("/no-building");
  }
  return s;
}
