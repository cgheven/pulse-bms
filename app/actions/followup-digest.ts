"use server";

import { requireRole } from "@/lib/auth";
import { buildAndSendDigest } from "@/lib/followup-digest";

export async function sendDigestNow(): Promise<
  | { sent: true; todayCount: number; overdueCount: number }
  | { sent: false; reason: string }
> {
  await requireRole("super_admin");
  return buildAndSendDigest();
}
