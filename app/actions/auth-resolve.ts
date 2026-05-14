"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone, syntheticEmailFromPhone } from "@/lib/phone";

/**
 * Resolve a user-typed login identifier into the actual email Supabase stores.
 *
 * Why this exists: residents log in with their mobile (e.g. "03193454321"),
 * but the Supabase auth user might have:
 *   (a) a synthetic email we generated  ->  03193454321@bms.local
 *   (b) a real email (admin/union members imported earlier with their actual
 *       email but `bms_profiles.phone` set to the same mobile)
 *
 * Always synthesizing breaks case (b). Always looking up by phone breaks case
 * (a) when the profile row hasn't yet been inserted. So we:
 *   1. If input has "@" -> use it as-is (email path).
 *   2. Else normalize phone, look up bms_profiles.phone -> return its email.
 *   3. Fallback to the synthetic form so brand-new accounts still work.
 *
 * Uses the admin client (bypasses RLS) because the user is unauthenticated
 * at login time and would otherwise see nothing.
 *
 * Returns `null` if the input is neither a valid email nor a parseable phone.
 */
export async function resolveLoginIdentifier(
  input: string,
): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes("@")) {
    return trimmed.toLowerCase();
  }

  const phone = normalizePhone(trimmed);
  if (!phone) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("bms_profiles")
    .select("email")
    .eq("phone", phone)
    .maybeSingle();

  return data?.email ?? syntheticEmailFromPhone(phone);
}
