"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export type FlatInput = {
  flat_number: string;
  floor?: number | null;
  block?: string | null;
  size_sqft?: number | null;
  monthly_fee?: number | null;
  ownership_type?: "owner" | "tenant" | "vacant";
  notes?: string | null;
};

export async function createFlat(input: FlatInput) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const payload = {
    building_id: profile.building_id,
    flat_number: input.flat_number.trim(),
    floor: input.floor ?? null,
    block: input.block?.trim() || null,
    size_sqft: input.size_sqft ?? null,
    monthly_fee: input.monthly_fee ?? null,
    ownership_type: input.ownership_type ?? "owner",
    notes: input.notes?.trim() || null,
  };

  const { data, error } = await supabase
    .from("bms_flats")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "flat.create",
    entity: "flat",
    entity_id: data.id,
    meta: payload,
  });

  revalidatePath("/admin/flats");
  revalidatePath("/admin");
  return data;
}

export async function updateFlat(id: string, input: Partial<FlatInput>) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.flat_number !== undefined) patch.flat_number = input.flat_number.trim();
  if (input.floor !== undefined) patch.floor = input.floor;
  if (input.block !== undefined) patch.block = input.block?.trim() || null;
  if (input.size_sqft !== undefined) patch.size_sqft = input.size_sqft;
  if (input.monthly_fee !== undefined) patch.monthly_fee = input.monthly_fee;
  if (input.ownership_type !== undefined) patch.ownership_type = input.ownership_type;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const { data, error } = await supabase
    .from("bms_flats")
    .update(patch)
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "flat.update",
    entity: "flat",
    entity_id: id,
    meta: patch,
  });

  revalidatePath("/admin/flats");
  revalidatePath(`/admin/flats/${id}`);
  revalidatePath("/admin");
  return data;
}

export async function deleteFlat(id: string) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { error } = await supabase
    .from("bms_flats")
    .delete()
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "flat.delete",
    entity: "flat",
    entity_id: id,
  });

  revalidatePath("/admin/flats");
  revalidatePath("/admin");
  return { ok: true };
}
