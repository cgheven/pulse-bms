import { NextRequest, NextResponse } from "next/server";
import { buildAndSendDigest } from "@/lib/followup-digest";

// Vercel calls this route daily at 11am PKT (06:00 UTC).
// Secured by CRON_SECRET — set this env var in Vercel and add it to .env.local.
// Vercel sends: Authorization: Bearer <CRON_SECRET>

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/followup-digest] CRON_SECRET not set");
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await buildAndSendDigest();
  if (!result.sent) {
    console.info("[cron/followup-digest] skipped:", result.reason);
    return NextResponse.json({ sent: false, reason: result.reason });
  }

  return NextResponse.json({
    sent: true,
    todayCount: result.todayCount,
    overdueCount: result.overdueCount,
  });
}
