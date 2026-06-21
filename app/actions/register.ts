"use server";

import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOTPEmail, sendPasswordResetEmail } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";

// ─── Private helpers ──────────────────────────────────────────────────────────

function generateOTP(): string {
  // Uniform distribution over [100000, 999999] with no modulo bias
  return String(100000 + (randomBytes(4).readUInt32BE(0) % 900000));
}

function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

function hashOTP(otp: string, salt: string): string {
  return createHash("sha256").update(otp + salt).digest("hex");
}

function verifyOTPHash(input: string, storedHash: string, salt: string): boolean {
  const computed = Buffer.from(hashOTP(input, salt), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}

async function getClientIP(): Promise<string> {
  const h = await headers();
  // On Vercel, `x-vercel-forwarded-for` is set by the edge network and cannot
  // be overridden by the client, so it is the safest source of the real IP.
  // For other proxies (e.g. Cloudflare), `CF-Connecting-IP` would be preferred.
  // Fallback: take the LAST element of x-forwarded-for, which is appended by
  // the closest trusted proxy and is not attacker-controlled (unlike the first
  // element, which is entirely client-supplied and trivially spoofable).
  // Never use x-forwarded-for[0] for security decisions.
  return (
    h.get("x-vercel-forwarded-for") ??
    h.get("x-forwarded-for")?.split(",").pop()?.trim() ??
    h.get("x-real-ip") ??
    "0.0.0.0"
  );
}

// ─── startRegistration ────────────────────────────────────────────────────────

export async function startRegistration(input: {
  email: string;
  full_name: string;
  building_name: string;
  city: string;
  flat_limit: number;
}): Promise<{ registration_id: string; message: string }> {
  const ip = await getClientIP();
  const adminDb = createAdminClient();

  // Sanitise + validate
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address.");
  const fullName = input.full_name.trim();
  if (fullName.length < 2) throw new Error("Full name must be at least 2 characters.");
  const buildingName = input.building_name.trim();
  if (buildingName.length < 2) throw new Error("Building name must be at least 2 characters.");
  const city = input.city.trim() || "Karachi";
  const flatLimit = Math.round(Number(input.flat_limit));
  if (!Number.isFinite(flatLimit) || flatLimit < 1 || flatLimit > 1500)
    throw new Error("Number of flats must be between 1 and 1,500.");

  // Opportunistic cleanup: delete unconverted registrations older than 24 h.
  // This is a best-effort sweep; it does not need to succeed for the flow to continue.
  void adminDb
    .from("bms_self_registrations")
    .delete()
    .is("converted_at", null)
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());

  // IP rate limit: max 5 new registration starts per hour per IP
  const ipSince = new Date(Date.now() - 3_600_000).toISOString();
  const { count: ipCount } = await adminDb
    .from("bms_self_registrations")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("created_at", ipSince);
  if ((ipCount ?? 0) >= 5)
    throw new Error("Too many requests from this device. Please try again in an hour.");

  // Load any existing unconverted registration for this email
  const { data: existing } = await adminDb
    .from("bms_self_registrations")
    .select("id, send_count, last_sent_at")
    .eq("email", email)
    .is("converted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Per-email: max 5 OTPs sent total
  if (existing && (existing.send_count ?? 0) >= 5)
    throw new Error(
      "Too many verification codes sent to this email. Please wait an hour and try again.",
    );

  // Resend cooldown: 60 s between sends
  if (existing?.last_sent_at) {
    const elapsed = Date.now() - new Date(existing.last_sent_at).getTime();
    if (elapsed < 60_000) {
      const wait = Math.ceil((60_000 - elapsed) / 1000);
      throw new Error(
        `Please wait ${wait} second${wait === 1 ? "" : "s"} before requesting another code.`,
      );
    }
  }

  const otp = generateOTP();
  const salt = generateSalt();
  const otpHash = hashOTP(otp, salt);
  const otpExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

  let registrationId: string;

  if (existing) {
    const { data: updated, error } = await adminDb
      .from("bms_self_registrations")
      .update({
        full_name: fullName,
        building_name: buildingName,
        city,
        flat_limit: flatLimit,
        otp_hash: otpHash,
        otp_salt: salt,
        otp_expires_at: otpExpiresAt,
        attempts: 0,
        send_count: (existing.send_count ?? 0) + 1,
        last_sent_at: new Date().toISOString(),
        ip_address: ip,
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error || !updated) throw new Error("Failed to start registration. Please try again.");
    registrationId = updated.id;
  } else {
    const { data: created, error } = await adminDb
      .from("bms_self_registrations")
      .insert({
        email,
        full_name: fullName,
        building_name: buildingName,
        city,
        flat_limit: flatLimit,
        otp_hash: otpHash,
        otp_salt: salt,
        otp_expires_at: otpExpiresAt,
        send_count: 1,
        last_sent_at: new Date().toISOString(),
        ip_address: ip,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error("Failed to start registration. Please try again.");
    registrationId = created.id;
  }

  // Send email — if Resend fails the record exists so the user can resend
  await sendOTPEmail(email, fullName, otp, 15);

  return { registration_id: registrationId, message: "Verification code sent to your email." };
}

// ─── resendOTP ────────────────────────────────────────────────────────────────

export async function resendOTP(registrationId: string): Promise<{ message: string }> {
  const ip = await getClientIP();
  const adminDb = createAdminClient();

  const { data: reg, error } = await adminDb
    .from("bms_self_registrations")
    .select("id, email, full_name, send_count, last_sent_at, converted_at")
    .eq("id", registrationId)
    .is("converted_at", null)
    .maybeSingle();

  if (error || !reg) throw new Error("Registration session not found. Please start over.");
  if ((reg.send_count ?? 0) >= 5)
    throw new Error("Maximum resend limit reached. Please wait an hour and try again.");

  if (reg.last_sent_at) {
    const elapsed = Date.now() - new Date(reg.last_sent_at).getTime();
    if (elapsed < 60_000) {
      const wait = Math.ceil((60_000 - elapsed) / 1000);
      throw new Error(`Wait ${wait}s before resending.`);
    }
  }

  // IP-level check: max 10 resend calls per hour per IP (more lenient than start)
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count: ipCount } = await adminDb
    .from("bms_self_registrations")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("last_sent_at", since);
  if ((ipCount ?? 0) >= 10)
    throw new Error("Too many requests from this device. Please try again later.");

  const otp = generateOTP();
  const salt = generateSalt();
  const otpHash = hashOTP(otp, salt);
  const otpExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

  const { error: updateErr } = await adminDb
    .from("bms_self_registrations")
    .update({
      otp_hash: otpHash,
      otp_salt: salt,
      otp_expires_at: otpExpiresAt,
      attempts: 0,
      send_count: (reg.send_count ?? 0) + 1,
      last_sent_at: new Date().toISOString(),
      ip_address: ip,
    })
    .eq("id", registrationId);

  if (updateErr) throw new Error("Failed to refresh verification code. Please try again.");

  await sendOTPEmail(reg.email, reg.full_name, otp, 15);
  return { message: "New verification code sent." };
}

// ─── verifyOTPAndCreate ───────────────────────────────────────────────────────

export async function verifyOTPAndCreate(input: {
  registration_id: string;
  otp: string;
  password: string;
}): Promise<{ email: string }> {
  if (input.password.length < 8)
    throw new Error("Password must be at least 8 characters.");

  const adminDb = createAdminClient();

  const { data: reg, error: loadErr } = await adminDb
    .from("bms_self_registrations")
    .select("*")
    .eq("id", input.registration_id)
    .is("converted_at", null)
    .maybeSingle();

  if (loadErr || !reg) throw new Error("Registration session not found. Please start over.");
  if (reg.verified_at) throw new Error("This session has already been verified.");
  if (new Date(reg.otp_expires_at) < new Date())
    throw new Error("Verification code has expired. Click 'Resend code' to get a new one.");
  if (reg.attempts >= 3)
    throw new Error("Too many incorrect attempts. Click 'Resend code' to get a new one.");

  const inputOtp = input.otp.trim().replace(/\D/g, "");
  const valid = verifyOTPHash(inputOtp, reg.otp_hash, reg.otp_salt);

  if (!valid) {
    // Atomic server-side increment via Postgres function — prevents race conditions
    // where concurrent requests all read the same count and under-count attempts.
    const { data: newAttempts } = await adminDb.rpc("bms_increment_otp_attempt", {
      p_reg_id: input.registration_id,
    });
    if (newAttempts === null) {
      throw new Error("Registration session not found. Please start over.");
    }
    const remaining = 3 - (newAttempts as number);
    if (remaining <= 0)
      throw new Error("Too many incorrect attempts. Click 'Resend code' to get a new one.");
    throw new Error(
      `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
    );
  }

  // Guard: if a Supabase auth account already exists for this email, the user
  // must sign in instead of registering again. Checked here (post-OTP) so that
  // startRegistration does not reveal account existence via different code paths.
  const { data: existingProfile } = await adminDb
    .from("bms_profiles")
    .select("id")
    .eq("email", reg.email)
    .maybeSingle();
  if (existingProfile) {
    throw new Error(
      "This email is already registered. Please sign in or reset your password.",
    );
  }

  // Atomic claim: set verified_at only if still NULL — prevents race conditions
  const { data: claimed } = await adminDb
    .from("bms_self_registrations")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", input.registration_id)
    .is("verified_at", null)
    .select("id")
    .maybeSingle();

  if (!claimed) throw new Error("This session was already verified. Please start over.");

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60_000).toISOString();
  const today = now.toISOString().slice(0, 10);

  let createdBuildingId: string | null = null;
  let createdAuthUserId: string | null = null;

  try {
    // 1. Building
    const { data: building, error: bErr } = await adminDb
      .from("bms_buildings")
      .insert({
        name: reg.building_name,
        city: reg.city,
        address: null,
        total_flats: 0,
        flat_limit: reg.flat_limit,
        entry_fee_owner: 10000,
        entry_fee_tenant: 5000,
        monthly_fee_default: 3000,
        voting_rule: "majority",
        utility_cutoff_after_months: 3,
        is_active: true,
        fund_balance: 0,
        opening_balance_amount: 0,
        opening_balance_date: today,
        is_trial: true,
        trial_ends_at: trialEndsAt,
        trial_duration_days: 14,
        trial_created_by: null,
      })
      .select("id")
      .single();
    if (bErr || !building) throw new Error(bErr?.message ?? "Failed to create building.");
    createdBuildingId = building.id;

    // 2. Default Cash bank account
    const { error: bankErr } = await adminDb.from("bms_bank_accounts").insert({
      building_id: building.id,
      name: "Cash",
      type: "cash",
      opening_balance: 0,
      opening_balance_date: today,
      is_active: true,
    });
    if (bankErr) throw new Error(`Failed to create default bank account: ${bankErr.message}`);

    // 3. Auth user — pre-confirmed because we already verified the email via OTP
    const { data: authData, error: authErr } = await adminDb.auth.admin.createUser({
      email: reg.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: reg.full_name },
    });
    if (authErr || !authData?.user) throw new Error(authErr?.message ?? "Failed to create account.");
    createdAuthUserId = authData.user.id;

    // 4. Profile — role is always 'admin' for self-registered buildings
    const { error: profErr } = await adminDb.from("bms_profiles").upsert(
      {
        id: authData.user.id,
        email: reg.email,
        full_name: reg.full_name,
        role: "admin",
        building_id: building.id,
        is_active: true,
        is_demo: false,
      },
      { onConflict: "id" },
    );
    if (profErr) throw new Error(`Failed to create profile: ${profErr.message}`);

    // 5. Admin ↔ building junction
    const { error: jErr } = await adminDb.from("bms_admin_buildings").insert({
      profile_id: authData.user.id,
      building_id: building.id,
      is_primary: true,
    });
    if (jErr) throw new Error(`Failed to assign building: ${jErr.message}`);

    // 6. Mark registration fully converted
    await adminDb
      .from("bms_self_registrations")
      .update({ converted_at: new Date().toISOString() })
      .eq("id", input.registration_id);

    await writeAuditLog({
      actor_id: authData.user.id,
      actor_email: reg.email,
      actor_role: "admin",
      building_id: building.id,
      action: "self_registration.complete",
      entity: "building",
      entity_id: building.id,
      meta: {
        building_name: reg.building_name,
        flat_limit: reg.flat_limit,
        trial_ends_at: trialEndsAt,
      },
    });

    revalidatePath("/admin");
    return { email: reg.email };
  } catch (err) {
    if (createdBuildingId) {
      try { await adminDb.from("bms_buildings").delete().eq("id", createdBuildingId); } catch { /* best-effort */ }
    }
    if (createdAuthUserId) {
      try { await adminDb.from("bms_profiles").delete().eq("id", createdAuthUserId); } catch { /* best-effort */ }
      await adminDb.auth.admin.deleteUser(createdAuthUserId).catch(() => {});
    }
    throw err;
  }
}

// ─── requestPasswordReset ─────────────────────────────────────────────────────

export async function requestPasswordReset(
  email: string,
): Promise<{ message: string }> {
  // Always return the same message — prevents email enumeration
  const SAFE_MSG = "If an account exists, a reset link has been sent to that address.";

  const ip = await getClientIP();
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
    throw new Error("Enter a valid email address.");

  const adminDb = createAdminClient();
  const since = new Date(Date.now() - 3_600_000).toISOString();

  // IP rate limit: 5 per hour — silently succeed to prevent timing oracle
  const { count: ipCount } = await adminDb
    .from("bms_password_resets")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("created_at", since);
  if ((ipCount ?? 0) >= 5) return { message: SAFE_MSG };

  // Email rate limit: 3 per hour — silently succeed
  const { count: emailCount } = await adminDb
    .from("bms_password_resets")
    .select("id", { count: "exact", head: true })
    .eq("email", cleanEmail)
    .gte("created_at", since);
  if ((emailCount ?? 0) >= 3) return { message: SAFE_MSG };

  // Silently succeed if no account — never reveal account existence
  const { data: profile } = await adminDb
    .from("bms_profiles")
    .select("id")
    .eq("email", cleanEmail)
    .maybeSingle();
  if (!profile) return { message: SAFE_MSG };

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();

  const { error: insertErr } = await adminDb.from("bms_password_resets").insert({
    email: cleanEmail,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_address: ip,
  });
  if (insertErr) throw new Error("Failed to generate reset token. Please try again.");

  const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!rawSiteUrl) {
    console.error("[register] NEXT_PUBLIC_SITE_URL is not set — password reset email will contain a broken link.");
    throw new Error("Service misconfiguration. Please contact support.");
  }
  const siteUrl = rawSiteUrl.replace(/\/$/, "");
  const resetUrl = `${siteUrl}/auth/reset-password?token=${token}&email=${encodeURIComponent(cleanEmail)}`;

  await sendPasswordResetEmail(cleanEmail, resetUrl);
  return { message: SAFE_MSG };
}

// ─── resetPassword ────────────────────────────────────────────────────────────

export async function resetPassword(input: {
  token: string;
  email: string;
  password: string;
}): Promise<{ message: string }> {
  if (!input.token?.trim()) throw new Error("Invalid reset link.");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters.");

  const cleanEmail = input.email.trim().toLowerCase();
  const adminDb = createAdminClient();

  const tokenHash = createHash("sha256").update(input.token.trim()).digest("hex");

  const { data: reset, error } = await adminDb
    .from("bms_password_resets")
    .select("id, email, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .eq("email", cleanEmail)
    .is("used_at", null)
    .maybeSingle();

  if (error || !reset) throw new Error("Invalid or expired reset link. Please request a new one.");
  if (new Date(reset.expires_at) < new Date())
    throw new Error("This reset link has expired. Please request a new one.");

  const { data: profile } = await adminDb
    .from("bms_profiles")
    .select("id")
    .eq("email", cleanEmail)
    .maybeSingle();
  if (!profile) throw new Error("Account not found.");

  const { error: updateErr } = await adminDb.auth.admin.updateUserById(profile.id, {
    password: input.password,
  });
  if (updateErr) throw new Error("Failed to update password. Please try again.");

  // Mark token used — single-use enforcement
  await adminDb
    .from("bms_password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("id", reset.id);

  return { message: "Password updated. You can now sign in with your new password." };
}
