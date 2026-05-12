"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export type ResidentInput = {
  flat_id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  cnic?: string | null;
  relationship?: "owner" | "tenant" | "family";
  is_primary?: boolean;
  move_in_date?: string | null;
  move_out_date?: string | null;
  entry_fee_paid?: number;
  is_active?: boolean;
  invite?: boolean;
};

export async function createResident(input: ResidentInput) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  // If this resident is primary, demote other primaries on same flat
  if (input.is_primary) {
    await supabase
      .from("bms_residents")
      .update({ is_primary: false })
      .eq("flat_id", input.flat_id);
  }

  let profile_id: string | null = null;

  // Optionally invite via email
  if (input.invite && input.email) {
    try {
      const admin = createAdminClient();
      const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(
        input.email,
        {
          data: {
            full_name: input.full_name,
            building_id: profile.building_id,
            role: "resident",
          },
        },
      );
      if (!invErr && inv?.user?.id) {
        profile_id = inv.user.id;
        // Ensure profile row exists
        await admin.from("bms_profiles").upsert({
          id: inv.user.id,
          email: input.email,
          full_name: input.full_name,
          phone: input.phone ?? null,
          role: "resident",
          building_id: profile.building_id,
          is_active: true,
        });
      }
    } catch {
      // ignore invite errors — resident is still created
    }
  }

  const payload = {
    building_id: profile.building_id,
    flat_id: input.flat_id,
    profile_id,
    full_name: input.full_name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    cnic: input.cnic?.trim() || null,
    relationship: input.relationship ?? "owner",
    is_primary: input.is_primary ?? false,
    move_in_date: input.move_in_date || null,
    move_out_date: input.move_out_date || null,
    entry_fee_paid: input.entry_fee_paid ?? 0,
    is_active: input.is_active ?? true,
  };

  const { data, error } = await supabase
    .from("bms_residents")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);

  // If owner/tenant changes flat status
  if (payload.relationship === "owner" || payload.relationship === "tenant") {
    await supabase
      .from("bms_flats")
      .update({ ownership_type: payload.relationship })
      .eq("id", input.flat_id)
      .eq("building_id", profile.building_id);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "resident.create",
    entity: "resident",
    entity_id: data.id,
    meta: payload,
  });

  revalidatePath("/admin/residents");
  revalidatePath(`/admin/flats/${input.flat_id}`);
  revalidatePath("/admin");
  return data;
}

export async function updateResident(id: string, input: Partial<ResidentInput>) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  // load existing resident to know flat_id
  const { data: existing } = await supabase
    .from("bms_residents")
    .select("flat_id")
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .single();

  if (input.is_primary && existing?.flat_id) {
    await supabase
      .from("bms_residents")
      .update({ is_primary: false })
      .eq("flat_id", existing.flat_id)
      .neq("id", id);
  }

  const patch: Record<string, unknown> = {};
  if (input.full_name !== undefined) patch.full_name = input.full_name.trim();
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.email !== undefined) patch.email = input.email?.trim() || null;
  if (input.cnic !== undefined) patch.cnic = input.cnic?.trim() || null;
  if (input.relationship !== undefined) patch.relationship = input.relationship;
  if (input.is_primary !== undefined) patch.is_primary = input.is_primary;
  if (input.move_in_date !== undefined) patch.move_in_date = input.move_in_date || null;
  if (input.move_out_date !== undefined) patch.move_out_date = input.move_out_date || null;
  if (input.entry_fee_paid !== undefined) patch.entry_fee_paid = input.entry_fee_paid;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data, error } = await supabase
    .from("bms_residents")
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
    action: "resident.update",
    entity: "resident",
    entity_id: id,
    meta: patch,
  });

  revalidatePath("/admin/residents");
  revalidatePath(`/admin/residents/${id}`);
  if (existing?.flat_id) revalidatePath(`/admin/flats/${existing.flat_id}`);
  return data;
}

export async function deleteResident(id: string) {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const supabase = await createClient();

  const { error } = await supabase
    .from("bms_residents")
    .delete()
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "resident.delete",
    entity: "resident",
    entity_id: id,
  });

  revalidatePath("/admin/residents");
  return { ok: true };
}
