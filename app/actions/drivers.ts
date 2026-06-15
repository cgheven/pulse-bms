"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";

const BUCKET = "bms-documents";
const MAX_PHOTO_SIZE = 8 * 1024 * 1024; // 8 MB — phone photos fit comfortably

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME_TO_EXT = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

// Validate real image content, not the client-declared MIME (anti-spoof).
function isValidImageMagicBytes(header: Uint8Array, mimeType: string): boolean {
  switch (mimeType) {
    case "image/jpeg":
      return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    case "image/png":
      return (
        header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47 &&
        header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a
      );
    case "image/webp":
      return (
        header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
        header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
      );
    default:
      return false;
  }
}

const MAX_NAME_LEN = 80;
const RATE_LIMIT_PER_MINUTE = 10;

/** Throw if the caller has created too many driver rows in the last minute.
 *  Guards the service-role storage upload against an abusive resident. */
async function enforceRateLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("bms_drivers")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId)
    .gte("created_at", oneMinuteAgo);
  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE)
    throw new Error("Too many additions. Please wait a moment and try again.");
}

/** Resolve the caller's primary active resident row. */
async function callerResident() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: rows } = await supabase
    .from("bms_residents")
    .select("id, building_id, flat_id, is_primary")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false });

  const resident = rows?.[0];
  if (!resident) throw new Error("No active resident profile found.");
  return { user, resident, supabase };
}

/** Validate + upload an optional photo. Returns { path, mime } or nulls. */
async function uploadPhoto(
  file: File | null,
  buildingId: string,
  residentId: string,
): Promise<{ path: string | null; mime: string | null }> {
  if (!file || file.size === 0) return { path: null, mime: null };

  if (!ALLOWED_IMAGE_TYPES.has(file.type))
    throw new Error("Photo must be a JPG, PNG, or WebP image.");
  if (file.size > MAX_PHOTO_SIZE)
    throw new Error("Photo is too large. Maximum size is 8 MB.");

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!isValidImageMagicBytes(header, file.type))
    throw new Error("That file is not a valid image. Please pick a real photo.");

  const ext = MIME_TO_EXT.get(file.type) ?? "jpg";
  const uuid = crypto.randomUUID();
  const path = `${buildingId}/${residentId}/drivers/${uuid}.${ext}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);

  return { path, mime: file.type };
}

function parseFields(formData: FormData) {
  const full_name = ((formData.get("full_name") as string) ?? "").trim();
  const rawPhone = ((formData.get("phone") as string) ?? "").trim();
  const rawCnic = ((formData.get("cnic") as string) ?? "").trim();

  if (!full_name) throw new Error("Driver name is required.");
  if (full_name.length > MAX_NAME_LEN)
    throw new Error(`Name too long. Maximum ${MAX_NAME_LEN} characters.`);

  if (!rawPhone) throw new Error("Phone number is required.");
  const phone = normalizePhone(rawPhone);
  if (!phone)
    throw new Error("Enter a valid Pakistani mobile number (e.g. 0300-1234567).");

  // CNIC optional — if given, must be 13 digits.
  let cnic: string | null = null;
  if (rawCnic) {
    const digits = rawCnic.replace(/\D/g, "");
    if (digits.length !== 13)
      throw new Error("CNIC must be 13 digits (or leave it blank).");
    cnic = digits;
  }

  return { full_name, phone, cnic };
}

export async function addDriver(formData: FormData) {
  await requireNotDemo();
  const { profile } = await requireRole(["resident"]);
  const { user, resident, supabase } = await callerResident();

  await enforceRateLimit(supabase, user.id);

  const { full_name, phone, cnic } = parseFields(formData);
  const { path, mime } = await uploadPhoto(
    formData.get("photo") as File | null,
    resident.building_id,
    resident.id,
  );

  const { data, error } = await supabase
    .from("bms_drivers")
    .insert({
      building_id: resident.building_id,
      resident_id: resident.id,
      flat_id: resident.flat_id,
      full_name,
      phone,
      cnic,
      photo_path: path,
      photo_mime: mime,
      status: "active",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (path) await createAdminClient().storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: resident.building_id,
    action: "driver.add",
    entity: "driver",
    entity_id: data.id,
    meta: { full_name, has_photo: !!path },
  });

  revalidatePath("/resident/drivers");
}

export async function updateDriver(id: string, formData: FormData) {
  await requireNotDemo();
  const { profile } = await requireRole(["resident"]);
  const { user, resident, supabase } = await callerResident();

  // Ownership + current photo (RLS already restricts to the caller's rows).
  const { data: existing } = await supabase
    .from("bms_drivers")
    .select("id, photo_path")
    .eq("id", id)
    .eq("resident_id", resident.id)
    .maybeSingle();
  if (!existing) throw new Error("Driver not found.");

  const { full_name, phone, cnic } = parseFields(formData);

  const newFile = formData.get("photo") as File | null;
  let photoPatch: { photo_path: string; photo_mime: string | null } | null = null;
  if (newFile && newFile.size > 0) {
    const { path, mime } = await uploadPhoto(newFile, resident.building_id, resident.id);
    photoPatch = { photo_path: path!, photo_mime: mime };
  }

  // .select() so we can confirm a row was actually updated. A 0-row update
  // returns no error (and null data) — without this check we'd orphan the new
  // photo and wrongly delete the old one.
  const { data: updated, error } = await supabase
    .from("bms_drivers")
    .update({ full_name, phone, cnic, ...(photoPatch ?? {}) })
    .eq("id", id)
    .eq("resident_id", resident.id)
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    if (photoPatch) await createAdminClient().storage.from(BUCKET).remove([photoPatch.photo_path]);
    throw new Error(error?.message ?? "Driver not found.");
  }

  // Remove the old photo only after the row update succeeded.
  if (photoPatch && existing.photo_path) {
    await createAdminClient().storage.from(BUCKET).remove([existing.photo_path]);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: resident.building_id,
    action: "driver.update",
    entity: "driver",
    entity_id: id,
    meta: { full_name },
  });

  revalidatePath("/resident/drivers");
}

export async function setDriverStatus(id: string, status: "active" | "left") {
  await requireNotDemo();
  const { profile } = await requireRole(["resident"]);
  const { user, resident, supabase } = await callerResident();

  const { error } = await supabase
    .from("bms_drivers")
    .update({
      status,
      left_date: status === "left" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id)
    .eq("resident_id", resident.id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: resident.building_id,
    action: status === "left" ? "driver.mark_left" : "driver.mark_active",
    entity: "driver",
    entity_id: id,
  });

  revalidatePath("/resident/drivers");
}

export async function deleteDriver(id: string) {
  await requireNotDemo();
  const { profile } = await requireRole(["resident"]);
  const { user, resident, supabase } = await callerResident();

  const { data: existing } = await supabase
    .from("bms_drivers")
    .select("id, photo_path, full_name")
    .eq("id", id)
    .eq("resident_id", resident.id)
    .maybeSingle();
  if (!existing) throw new Error("Driver not found.");

  const { error } = await supabase
    .from("bms_drivers")
    .delete()
    .eq("id", id)
    .eq("resident_id", resident.id);
  if (error) throw new Error(error.message);

  if (existing.photo_path) {
    await createAdminClient().storage.from(BUCKET).remove([existing.photo_path]);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: resident.building_id,
    action: "driver.delete",
    entity: "driver",
    entity_id: id,
    meta: { full_name: existing.full_name },
  });

  revalidatePath("/resident/drivers");
}
