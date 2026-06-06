import { cache } from "react";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, Role } from "@/types";
import { ROLE_HOME } from "@/types";
import { getActiveBuilding } from "@/lib/building-context";

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

  if (profile && !profile.is_active) return null;
  return profile ? { user, profile } : null;
});

/**
 * Per-user cached lookup for the current user's building name.
 * Uses getActiveBuilding() so multi-building admins get the correct name
 * for whichever building they are currently scoped to.
 * Building names change rarely — 5 min TTL is safe.
 */
export const getCurrentBuildingName = cache(async (): Promise<string | null> => {
  const activeBuildingId = await getActiveBuilding();
  if (!activeBuildingId) return null;
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
    ["bms-building-name", activeBuildingId],
    { revalidate: 300, tags: [`bms-building-${activeBuildingId}`] },
  )(activeBuildingId);
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
  const activeBuildingId = await getActiveBuilding();
  if (!activeBuildingId && s.profile.role !== "super_admin") {
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
  // For admin/union mutations, also enforce trial expiry.
  // This covers the ~15 tables not protected by RLS trial-expiry policies.
  if (s.profile.role === "admin" || s.profile.role === "union") {
    await requireTrialActive();
  }
  return s;
}

/**
 * Guard for expired trial buildings.
 * Call from any mutation action in the admin context. Non-trial buildings pass
 * through unconditionally. Throws only when the active building is a trial
 * AND its trial_ends_at has passed.
 */
export async function requireTrialActive() {
  const s = await requireSession();
  const activeBuildingId = await getActiveBuilding();
  if (!activeBuildingId) return s;

  const admin = createAdminClient();
  const { data: building } = await admin
    .from("bms_buildings")
    .select("is_trial, trial_ends_at, is_active")
    .eq("id", activeBuildingId)
    .maybeSingle();

  if (building && !building.is_active) {
    throw new Error(
      "This building has been deactivated. Please contact your sales representative.",
    );
  }

  if (building?.is_trial && building?.trial_ends_at) {
    const expiryMs = Date.parse(building.trial_ends_at as string);
    if (!isNaN(expiryMs) && expiryMs < Date.now()) {
      throw new Error(
        "Your trial has expired. Please contact your sales representative to continue.",
      );
    }
  }
  return s;
}
