"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, requireNotDemo } from "@/lib/auth";
import { ACTIVE_BUILDING_COOKIE } from "@/lib/building-context";
import { writeAuditLog } from "@/lib/audit";

/**
 * Switches the admin's active building by setting the bms-active-building cookie.
 * Validates that the requested building is actually assigned to this admin
 * before setting the cookie — prevents IDOR if cookie is tampered.
 */
export async function switchBuilding(buildingId: string) {
  await requireNotDemo();
  const { profile } = await requireRole("admin");

  if (!buildingId) throw new Error("Building id required.");

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(buildingId)) throw new Error("Invalid building ID.");

  // Security: verify this building is assigned to this admin
  const adminDb = createAdminClient();
  const { data, error } = await adminDb
    .from("bms_admin_buildings")
    .select("building_id")
    .eq("profile_id", profile.id)
    .eq("building_id", buildingId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("This building is not assigned to your account.");

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_BUILDING_COOKIE, buildingId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    secure: process.env.NODE_ENV === "production",
  });

  await writeAuditLog({
    actor_id: profile.id,
    actor_email: profile.email,
    actor_role: profile.role,
    action: "building_switched",
    entity: "building",
    entity_id: buildingId,
    building_id: buildingId,
    meta: { switched_to: buildingId },
  });

  revalidatePath("/admin", "layout");
}
