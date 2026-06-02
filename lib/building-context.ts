import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const ACTIVE_BUILDING_COOKIE = "bms-active-building";

/**
 * Returns the building_id the current admin is actively working in.
 * - admin role: reads the bms-active-building cookie, validates against
 *   bms_admin_buildings junction table, falls back to profile.building_id.
 * - All other roles: returns profile.building_id unchanged.
 * - super_admin: returns null (no building scope).
 *
 * Wrapped in React.cache() so layout + page + multiple server actions
 * all share one DB round-trip per request.
 *
 * NOTE: Does NOT import from lib/auth to avoid circular dependency.
 * Uses direct Supabase calls to resolve the current user and profile.
 */
export const getActiveBuilding = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const adminDb = createAdminClient();
  const { data: profile } = await adminDb
    .from("bms_profiles")
    .select("id, role, building_id")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  // super_admin has no building scope
  if (profile.role === "super_admin") return null;

  // Non-admin roles are single-building — use profile directly
  if (profile.role !== "admin") return profile.building_id;

  // Admin: try the active-building cookie first
  let cookieVal: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieVal = cookieStore.get(ACTIVE_BUILDING_COOKIE)?.value;
  } catch {
    cookieVal = undefined;
  }

  if (cookieVal) {
    // Validate: cookie must match a real assignment (prevent IDOR)
    const { data } = await adminDb
      .from("bms_admin_buildings")
      .select("building_id")
      .eq("profile_id", profile.id)
      .eq("building_id", cookieVal)
      .maybeSingle();
    if (data) return cookieVal;
    // Cookie is stale/tampered — delete it and fall through to primary
    try {
      const cookieStore = await cookies();
      cookieStore.delete(ACTIVE_BUILDING_COOKIE);
    } catch { /* ignore in static context */ }
  }

  // Fall back to profile.building_id (primary building)
  return profile.building_id;
});

/**
 * Returns all buildings assigned to the current admin, ordered primary-first.
 * Returns empty array for non-admin roles.
 * Wrapped in React.cache() for per-request deduplication.
 *
 * NOTE: Does NOT import from lib/auth to avoid circular dependency.
 */
export const getAssignedBuildings = cache(async (): Promise<
  { id: string; name: string; is_primary: boolean }[]
> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const adminDb = createAdminClient();
  const { data: profile } = await adminDb
    .from("bms_profiles")
    .select("id, role, building_id")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") return [];

  const { data } = await adminDb
    .from("bms_admin_buildings")
    .select("building_id, is_primary, bms_buildings(id, name)")
    .eq("profile_id", profile.id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (!data) return [];

  return data.map((row: any) => ({
    id: row.building_id as string,
    name: (row.bms_buildings as { name: string } | null)?.name ?? "Unknown",
    is_primary: row.is_primary as boolean,
  }));
});
