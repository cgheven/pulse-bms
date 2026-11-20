import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateMaintenanceInvoices } from "@/lib/maintenance-invoices";

// Vercel calls this on the 1st of each month. Secured by CRON_SECRET (same as
// the follow-up digest). Generates the current month's maintenance invoices
// for every active, non-expired building — so no one ever clicks a button.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/generate-invoices] CRON_SECRET not set");
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(auth);
  const valid =
    expected.length === provided.length && timingSafeEqual(expected, provided);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Current month in PKT (UTC+5) so the 1st-of-month run bills the new month.
  const currentYm = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 7);
  const nowMs = Date.now();

  const { data: buildings, error } = await admin
    .from("bms_buildings")
    .select("id, name, is_active, is_trial, trial_ends_at");
  if (error) {
    console.error("[cron/generate-invoices]", error.message);
    return NextResponse.json({ error: "Could not list buildings." }, { status: 500 });
  }

  let totalInserted = 0;
  let billedBuildings = 0;
  const failures: string[] = [];

  for (const b of buildings ?? []) {
    if (!b.is_active) continue;
    // Skip expired trials — they shouldn't accrue new bills.
    if (b.is_trial && b.trial_ends_at && Date.parse(b.trial_ends_at as string) < nowMs) {
      continue;
    }
    try {
      const r = await generateMaintenanceInvoices(admin, b.id, currentYm);
      if (r.inserted > 0) {
        totalInserted += r.inserted;
        billedBuildings += 1;
      }
    } catch (err) {
      console.error("[cron/generate-invoices]", b.id, err);
      failures.push(b.id);
    }
  }

  return NextResponse.json({
    ok: true,
    month: currentYm,
    billedBuildings,
    totalInserted,
    failures: failures.length,
  });
}
