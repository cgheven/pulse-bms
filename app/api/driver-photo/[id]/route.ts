import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "bms-documents";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Session-based auth — re-validated on every request.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  // RLS-enforced lookup: only returns the row if the caller (resident owner or
  // building staff) is allowed to see this driver. Storage path never leaves the server.
  const { data: driver } = await supabase
    .from("bms_drivers")
    .select("photo_path, photo_mime")
    .eq("id", id)
    .maybeSingle();

  if (!driver?.photo_path) return new NextResponse("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(driver.photo_path, 60, {
      transform: { width: 600, quality: 75 },
    });
  if (signErr || !signed) return new NextResponse("Storage unavailable", { status: 502 });

  const upstream = await fetch(signed.signedUrl);
  if (!upstream.ok) return new NextResponse("File not found in storage", { status: 404 });

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": driver.photo_mime ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
