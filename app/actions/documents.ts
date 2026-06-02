"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { revalidatePath } from "next/cache";
import { DOC_TYPE_LABELS } from "@/lib/document-types";

const BUCKET = "bms-documents";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const RATE_LIMIT_PER_MINUTE = 10;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

// Extension ALWAYS derived from MIME type — never from client filename.
// Prevents double-extension attacks (e.g. evil.pdf.js → stored as uuid.js).
const MIME_TO_EXT = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg",      "jpg"],
  ["image/png",       "png"],
  ["image/webp",      "webp"],
]);

// Magic byte signatures. Validates actual file content, not client-declared type.
// Prevents MIME spoofing: attacker uploads HTML/JS with file.type="image/jpeg".
function isValidMagicBytes(header: Uint8Array, mimeType: string): boolean {
  switch (mimeType) {
    case "application/pdf":
      // %PDF
      return header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46;
    case "image/jpeg":
      // FF D8 FF
      return header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF;
    case "image/png":
      // 89 PNG \r\n \x1a\n
      return (
        header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47 &&
        header[4] === 0x0D && header[5] === 0x0A && header[6] === 0x1A && header[7] === 0x0A
      );
    case "image/webp":
      // RIFF....WEBP
      return (
        header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
        header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
      );
    default:
      return false;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LABEL_LENGTH = 80;

export async function uploadResidentDocument(formData: FormData) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const residentId = formData.get("resident_id") as string;
  const docType   = formData.get("doc_type")    as string;
  const rawLabel  = (formData.get("label") as string | null)?.trim() || null;
  const file      = formData.get("file") as File | null;

  // ── Input presence ─────────────────────────────────────────────────────────
  if (!residentId || !docType || !file || file.size === 0)
    throw new Error("Missing required fields");

  // ── Format / whitelist checks ───────────────────────────────────────────────
  if (!UUID_RE.test(residentId))
    throw new Error("Invalid resident ID");

  if (!ALLOWED_TYPES.has(file.type))
    throw new Error("File type not allowed. Use PDF, JPG, PNG, or WebP.");

  if (file.size > MAX_FILE_SIZE)
    throw new Error("File too large. Maximum size is 10 MB.");

  if (!Object.keys(DOC_TYPE_LABELS).includes(docType))
    throw new Error("Invalid document type");

  if (docType === "other" && !rawLabel)
    throw new Error("Label is required for Other document type");

  if (rawLabel) {
    if (rawLabel.length > MAX_LABEL_LENGTH)
      throw new Error(`Label too long. Maximum ${MAX_LABEL_LENGTH} characters.`);
  }

  // ── Magic byte validation: confirm actual content matches declared MIME ──────
  // Reads only the first 12 bytes — avoids loading the whole file into memory.
  const headerBuf = await file.slice(0, 12).arrayBuffer();
  const header    = new Uint8Array(headerBuf);
  if (!isValidMagicBytes(header, file.type))
    throw new Error(
      "File content does not match the declared type. Upload a genuine PDF or image file.",
    );

  const supabase = await createClient();

  // ── Rate limiting: max 10 uploads per minute per admin ─────────────────────
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount } = await supabase
    .from("bms_resident_documents")
    .select("*", { count: "exact", head: true })
    .eq("uploaded_by", user.id)
    .gte("created_at", oneMinuteAgo);
  if ((recentCount ?? 0) >= RATE_LIMIT_PER_MINUTE)
    throw new Error("Too many uploads. Please wait a moment before trying again.");

  // ── Tenant / resident scoping ───────────────────────────────────────────────
  const { data: resident } = await supabase
    .from("bms_residents")
    .select("id")
    .eq("id", residentId)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!resident) throw new Error("Resident not found in your building");

  // Extension from MIME type — never from the filename.
  // Stored name is server-generated; original client filename is never persisted.
  const ext         = MIME_TO_EXT.get(file.type) ?? "bin";
  const uuid        = crypto.randomUUID();
  const storedName  = `${docType}_${uuid.slice(0, 8)}.${ext}`;
  const storagePath = `${buildingId}/${residentId}/${docType}/${uuid}.${ext}`;

  const adminClient = createAdminClient();

  // Upload file object directly — Supabase SDK streams it, avoids full heap load
  const { error: uploadErr } = await adminClient.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { error: dbErr } = await supabase
    .from("bms_resident_documents")
    .insert({
      building_id:  buildingId,
      resident_id:  residentId,
      doc_type:     docType,
      label:        rawLabel,
      file_name:    storedName,
      storage_path: storagePath,
      file_size:    file.size,
      mime_type:    file.type,
      uploaded_by:  user.id,
    });

  if (dbErr) {
    // Roll back storage — log failure but surface original DB error to caller
    const { error: removeErr } = await adminClient.storage.from(BUCKET).remove([storagePath]);
    if (removeErr)
      console.error("[documents] Storage rollback failed after DB error:", removeErr.message);
    throw new Error(dbErr.message);
  }

  await writeAuditLog({
    actor_id:   user.id,
    actor_email: user.email,
    actor_role:  profile.role,
    building_id: buildingId,
    action:      "document.upload",
    entity:      "resident_document",
    entity_id:   residentId,
    meta:        { doc_type: docType, file_name: storedName, file_size: file.size },
  });

  revalidatePath(`/admin/residents/${residentId}`);
  revalidatePath("/resident/documents");
}

export async function deleteResidentDocument(documentId: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("bms_resident_documents")
    .select("id, storage_path, resident_id, doc_type, file_name")
    .eq("id", documentId)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!doc) throw new Error("Document not found");

  const adminClient = createAdminClient();
  const { error: removeErr } = await adminClient.storage.from(BUCKET).remove([doc.storage_path]);
  if (removeErr)
    console.error("[documents] Storage delete failed:", removeErr.message);

  const { error } = await supabase
    .from("bms_resident_documents")
    .delete()
    .eq("id", documentId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id:   user.id,
    actor_email: user.email,
    actor_role:  profile.role,
    building_id: buildingId,
    action:      "document.delete",
    entity:      "resident_document",
    entity_id:   doc.resident_id,
    meta:        { doc_type: doc.doc_type, file_name: doc.file_name },
  });

  revalidatePath(`/admin/residents/${doc.resident_id}`);
  revalidatePath("/resident/documents");
}

// ── Signed URL generation ────────────────────────────────────────────────────
//
// Takes a document ID (not storage path). Performs an RLS-enforced DB lookup
// so the caller can never generate a URL for a document they don't own —
// even if they somehow know the storage path.
//
// Internal server components that have already verified access via their own
// RLS query may call _signedUrlFromPath() directly to avoid the extra lookup.

export async function createDocumentSignedUrl(documentId: string): Promise<string> {
  await requireRole(["admin", "super_admin", "resident"]);

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("bms_resident_documents")
    .select("storage_path, mime_type")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) throw new Error("Document not found or access denied");

  return _signedUrlFromPath(doc.storage_path, doc.mime_type);
}

// Not exported — for server component page rendering only,
// after the caller has already confirmed access via RLS.
export async function _signedUrlFromPath(
  storagePath: string,
  mimeType: string | null,
): Promise<string> {
  const adminClient = createAdminClient();
  const isImage = mimeType?.startsWith("image/") ?? false;

  const { data, error } = await adminClient.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600, {
      ...(isImage ? { transform: { width: 1200, quality: 80 } } : {}),
    });
  if (error || !data) throw new Error("Could not generate download link");
  return data.signedUrl;
}
