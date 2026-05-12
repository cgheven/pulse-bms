import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/types";
import { ROLE_HOME } from "@/types";

export async function getSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("bms_profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return profile ? { user, profile: profile as Profile } : null;
}

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
