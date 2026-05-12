"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export type ComplaintCategory =
  | "water"
  | "electricity"
  | "lift"
  | "cleanliness"
  | "security"
  | "noise"
  | "other";

export type ComplaintPriority = "low" | "normal" | "high" | "urgent";

export async function raiseComplaint(input: {
  title: string;
  description: string;
  category: ComplaintCategory;
  priority: ComplaintPriority;
}) {
  const { profile, user } = await requireRole("resident");
  if (!profile.building_id) throw new Error("No building assigned to this resident");

  const title = input.title?.trim();
  if (!title) throw new Error("Title is required");
  if (title.length > 200) throw new Error("Title is too long");

  const description = input.description?.trim() ?? "";
  const validCats: ComplaintCategory[] = [
    "water",
    "electricity",
    "lift",
    "cleanliness",
    "security",
    "noise",
    "other",
  ];
  const validPrios: ComplaintPriority[] = ["low", "normal", "high", "urgent"];
  if (!validCats.includes(input.category)) throw new Error("Invalid category");
  if (!validPrios.includes(input.priority)) throw new Error("Invalid priority");

  const supabase = await createClient();

  // primary flat for this resident
  const { data: r } = await supabase
    .from("bms_residents")
    .select("id, flat_id")
    .eq("profile_id", profile.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("bms_complaints")
    .insert({
      building_id: profile.building_id,
      flat_id: r?.flat_id ?? null,
      resident_id: r?.id ?? null,
      raised_by: profile.id,
      title,
      description,
      category: input.category,
      priority: input.priority,
      status: "open",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "complaint.create",
    entity: "complaint",
    entity_id: data.id,
    meta: { ...input },
  });

  revalidatePath("/resident/complaints");
  return { id: data.id };
}

export async function updateMyProfile(input: {
  full_name?: string;
  phone?: string;
}) {
  const { profile, user } = await requireRole("resident");
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (typeof input.full_name === "string") {
    const v = input.full_name.trim();
    if (v.length === 0 || v.length > 120) throw new Error("Invalid name");
    patch.full_name = v;
  }
  if (typeof input.phone === "string") {
    const v = input.phone.trim();
    if (v.length > 30) throw new Error("Invalid phone");
    patch.phone = v;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase
    .from("bms_profiles")
    .update(patch)
    .eq("id", profile.id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "profile.self_update",
    entity: "profile",
    entity_id: profile.id,
    meta: patch,
  });

  revalidatePath("/resident");
  return { ok: true };
}
