import { cache } from "react";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, Role } from "@/types";
import { ROLE_HOME } from "@/types";

/**
 * Session resolver.
 *
 * - `auth.getUser()` always runs (JWT validation must not be cached).
 * - The PROFILE row is cached cross-request via `unstable_cache` for 5 min,
 *   tagged per-user so we can invalidate on profile updates. This kills the
 *   per-nav round-trip to fetch the profile.
 * - React.cache() dedupes within a single request (layout + page share one).
 *
 * Use admin client inside unstable_cache because the cache callback runs
 * outside the request scope (no cookies).
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await unstable_cache(
    async (uid: string) => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("bms_profiles")
        .select("*")
        .eq("id", uid)
        .single();
      return data as Profile | null;
    },
    ["bms-profile", user.id],
    { revalidate: 300, tags: [`bms-profile-${user.id}`] },
  )(user.id);

  return profile ? { user, profile } : null;
});

/**
 * Per-user cached lookup for the current user's building name.
 * Building names change rarely — 5 min TTL is safe.
 */
export const getCurrentBuildingName = cache(async (): Promise<string | null> => {
  const s = await getSession();
  if (!s?.profile.building_id) return null;
  return unstable_cache(
    async (id: string) => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("bms_buildings")
        .select("name")
        .eq("id", id)
        .single();
      return data?.name ?? null;
    },
    ["bms-building-name", s.profile.building_id],
    { revalidate: 300, tags: [`bms-building-${s.profile.building_id}`] },
  )(s.profile.building_id);
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

/**
 * Read-only guard for sales-demo accounts.
 *
 * Every mutation server action (insert/update/delete) must call this BEFORE
 * touching the DB. Demo accounts are seeded with is_demo=true on
 * bms_profiles; this helper throws so the action fails loudly with a toast,
 * and a stacked restrictive RLS policy backs it up at the DB layer.
 *
 * Read-only actions do NOT need this — demo users are allowed to browse.
 */
export async function requireNotDemo() {
  const s = await requireSession();
  if (s.profile.is_demo) {
    throw new Error(
      "Demo accounts are read-only. Sign up to make changes.",
    );
  }
  return s;
}
