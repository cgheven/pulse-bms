import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "bms-documents";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Session-based auth — no token in URL, re-validated on every request
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // RLS-enforced lookup: only returns the row if the caller (admin or resident)
  // has access to it. Supabase URL and storage path never leave the server.
  const { data: doc } = await supabase
    .from("bms_resident_documents")
    .select("storage_path, mime_type, file_name")
    .eq("id", id)
    .maybeSingle();

  if (!doc) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Short-lived signed URL (60 s) used only for the internal server→storage
  // fetch. It is never sent to the client.
  const adminClient = createAdminClient();
  const { data: signed, error: signErr } = await adminClient.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, 60);

  if (signErr || !signed) {
    return new NextResponse("Storage unavailable", { status: 502 });
  }

  // Stream file bytes from Supabase → client without buffering in memory
  const upstream = await fetch(signed.signedUrl);
  if (!upstream.ok) {
    return new NextResponse("File not found in storage", { status: 404 });
  }

  const contentType = doc.mime_type ?? "application/octet-stream";
  // encodeURIComponent handles filenames with spaces, accents, etc.
  const safeName = encodeURIComponent(doc.file_name);

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type":              contentType,
      "Content-Disposition":       `inline; filename*=UTF-8''${safeName}`,
      "Cache-Control":             "private, max-age=3600",
      "X-Content-Type-Options":    "nosniff",
      "X-Frame-Options":           "SAMEORIGIN",
    },
  });
}
