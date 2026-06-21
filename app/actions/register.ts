"use server";

import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOTPEmail, sendPasswordResetEmail } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";

// ─── Private helpers ──────────────────────────────────────────────────────────

function generateOTP(): string {
  // Rejection sampling: only draw values in the largest multiple-of-900000
  // range of uint32, so every output is equally probable (no modulo bias).
  const RANGE = 900000;
  const MAX_SAFE = Math.floor(4294967296 / RANGE) * RANGE; // 4_294_500_000
  let n: number;
  do {
    n = randomBytes(4).readUInt32BE(0);
  } while (n >= MAX_SAFE);
  return String(100000 + (n % RANGE));
}

function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

function hashOTP(otp: string, salt: string): string {
  // Explicit domain separator prevents length-extension ambiguity
  return createHash("sha256").update(otp).update(":").update(salt).digest("hex");
}

function verifyOTPHash(input: string, storedHash: string, salt: string): boolean {
  const computed = Buffer.from(hashOTP(input, salt), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}

// Top common passwords — deny at the server layer so simple passwords can't
// slip through even if the client-side check is bypassed.
const COMMON_PASSWORDS = new Set([
  "password","123456","password1","12345678","qwerty","abc123","12345",
  "password123","admin123","letmein","iloveyou","monkey","1234567","sunshine",
  "princess","dragon","master","welcome","login","passw0rd","1234567890",
  "123123","admin","superman","1q2w3e4r","qwerty123","qwertyuiop","baseball",
  "football","trustno1","123456789","mustang","shadow","michael","jessica",
  "123456a","654321","111111","000000","1111111","qwerty1","qwerty12",
]);

function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (COMMON_PASSWORDS.has(pw.toLowerCase()))
    return "This password is too common. Please choose a more unique one.";
  return null;
}

async function getClientIP(): Promise<string> {
  const h = await headers();
  // On Vercel, `x-vercel-forwarded-for` is set by the edge network and cannot
  // be spoofed by the client. On non-Vercel hosts the fallback uses the LAST
  // element of x-forwarded-for (appended by the closest trusted proxy), which
  // is still spoofable if no trusted proxy is in front of the app — deploy
  // behind a CDN/reverse-proxy and set TRUSTED_PROXY=1 to indicate that.
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
}): Promise<{ registration_id?: string; message?: string; error?: string }> {
  const ip = await getClientIP();
  const adminDb = createAdminClient();

  // Sanitise + validate
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "Enter a valid email address." };
  const fullName = input.full_name.trim();
  if (fullName.length < 2) return { error: "Full name must be at least 2 characters." };
  const buildingName = input.building_name.trim();
  if (buildingName.length < 2) return { error: "Building name must be at least 2 characters." };
  const city = input.city.trim() || "Karachi";
  const flatLimit = Math.round(Number(input.flat_limit));
  if (!Number.isFinite(flatLimit) || flatLimit < 1 || flatLimit > 1500)
    return { error: "Number of flats must be between 1 and 1,500." };

  // Opportunistic cleanup: delete unconverted registrations older than 24 h.
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
  if ((ipCount ?? 0) >= 5) {
    console.warn("[security] Registration rate limit hit", { ip, email });
    void writeAuditLog({ actor_id: null, action: "registration.rate_limit", entity: "ip", ip_address: ip, meta: { email } });
    return { error: "Too many requests from this device. Please try again in an hour." };
  }

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
    return { error: "Too many verification codes sent to this email. Please wait an hour and try again." };

  // Resend cooldown: 60 s between sends
  if (existing?.last_sent_at) {
    const elapsed = Date.now() - new Date(existing.last_sent_at).getTime();
    if (elapsed < 60_000) {
      const wait = Math.ceil((60_000 - elapsed) / 1000);
      return { error: `Please wait ${wait} second${wait === 1 ? "" : "s"} before requesting another code.` };
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
    if (error || !updated) return { error: "Failed to start registration. Please try again." };
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
    if (error || !created) return { error: "Failed to start registration. Please try again." };
    registrationId = created.id;
  }

  const { error: emailError } = await sendOTPEmail(email, fullName, otp, 15);
  if (emailError) return { error: emailError };

  return { registration_id: registrationId, message: "Verification code sent to your email." };
}

// ─── resendOTP ────────────────────────────────────────────────────────────────

export async function resendOTP(registrationId: string): Promise<{ message?: string; error?: string }> {
  const ip = await getClientIP();
  const adminDb = createAdminClient();

  const { data: reg, error } = await adminDb
    .from("bms_self_registrations")
    .select("id, email, full_name, send_count, last_sent_at, converted_at")
    .eq("id", registrationId)
    .is("converted_at", null)
    .maybeSingle();

  if (error || !reg) return { error: "Registration session not found. Please start over." };
  if ((reg.send_count ?? 0) >= 5)
    return { error: "Maximum resend limit reached. Please wait an hour and try again." };

  if (reg.last_sent_at) {
    const elapsed = Date.now() - new Date(reg.last_sent_at).getTime();
    if (elapsed < 60_000) {
      const wait = Math.ceil((60_000 - elapsed) / 1000);
      return { error: `Wait ${wait}s before resending.` };
    }
  }

  // IP-level check: max 10 resend calls per hour per IP
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count: ipCount } = await adminDb
    .from("bms_self_registrations")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("last_sent_at", since);
  if ((ipCount ?? 0) >= 10) {
    console.warn("[security] Resend rate limit hit", { ip, email: reg.email });
    return { error: "Too many requests from this device. Please try again later." };
  }

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

  if (updateErr) return { error: "Failed to refresh verification code. Please try again." };

  const { error: emailError } = await sendOTPEmail(reg.email, reg.full_name, otp, 15);
  if (emailError) return { error: emailError };
  return { message: "New verification code sent." };
}

// ─── verifyOTPAndCreate ───────────────────────────────────────────────────────

export async function verifyOTPAndCreate(input: {
  registration_id: string;
  otp: string;
  password: string;
}): Promise<{ email?: string; error?: string }> {
  const ip = await getClientIP();
  const pwError = validatePassword(input.password);
  if (pwError) return { error: pwError };

  const adminDb = createAdminClient();

  const { data: reg, error: loadErr } = await adminDb
    .from("bms_self_registrations")
    .select("*")
    .eq("id", input.registration_id)
    .is("converted_at", null)
    .maybeSingle();

  if (loadErr || !reg) return { error: "Registration session not found. Please start over." };
  if (reg.verified_at) return { error: "This session has already been verified." };
  if (new Date(reg.otp_expires_at) < new Date())
    return { error: "Verification code has expired. Click 'Resend code' to get a new one." };
  if (reg.attempts >= 3)
    return { error: "Too many incorrect attempts. Click 'Resend code' to get a new one." };

  const inputOtp = input.otp.trim().replace(/\D/g, "");
  const valid = verifyOTPHash(inputOtp, reg.otp_hash, reg.otp_salt);

  if (!valid) {
    const { data: newAttempts } = await adminDb.rpc("bms_increment_otp_attempt", {
      p_reg_id: input.registration_id,
    });
    if (newAttempts === null) {
      return { error: "Registration session not found. Please start over." };
    }
    const remaining = 3 - (newAttempts as number);
    console.warn("[security] OTP failure", { registrationId: input.registration_id, email: reg.email, ip, attempts: newAttempts });
    void writeAuditLog({ actor_id: null, action: "otp.failed", entity: "registration", entity_id: input.registration_id, ip_address: ip, meta: { email: reg.email, attempts: newAttempts } });
    if (remaining <= 0)
      return { error: "Too many incorrect attempts. Click 'Resend code' to get a new one." };
    return { error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` };
  }

  // Guard: check account existence post-OTP only (prevents enumeration via startRegistration)
  const { data: existingProfile } = await adminDb
    .from("bms_profiles")
    .select("id")
    .eq("email", reg.email)
    .maybeSingle();
  if (existingProfile) {
    console.warn("[security] Duplicate account attempt blocked post-OTP", { email: reg.email, ip });
    void writeAuditLog({ actor_id: null, action: "registration.duplicate_blocked", entity: "registration", entity_id: input.registration_id, ip_address: ip, meta: { email: reg.email } });
    return { error: "This email is already registered. Please sign in or reset your password." };
  }

  // Atomic claim: set verified_at only if still NULL — prevents double-claim
  const { data: claimed } = await adminDb
    .from("bms_self_registrations")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", input.registration_id)
    .is("verified_at", null)
    .select("id")
    .maybeSingle();

  if (!claimed) return { error: "This session was already verified. Please start over." };

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60_000).toISOString();
  const today = now.toISOString().slice(0, 10);

  let createdBuildingId: string | null = null;
  let createdBankAccountBuildingId: string | null = null;
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
    if (bErr || !building) return { error: "Failed to create building. Please try again." };
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
    if (bankErr) return { error: "Failed to create default bank account. Please try again." };
    createdBankAccountBuildingId = building.id;

    // 3. Auth user — pre-confirmed because we already verified the email via OTP
    const { data: authData, error: authErr } = await adminDb.auth.admin.createUser({
      email: reg.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: reg.full_name },
    });
    if (authErr || !authData?.user) return { error: "Failed to create account. Please try again." };
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
    if (profErr) return { error: "Failed to create profile. Please try again." };

    // 5. Admin ↔ building junction
    const { error: jErr } = await adminDb.from("bms_admin_buildings").insert({
      profile_id: authData.user.id,
      building_id: building.id,
      is_primary: true,
    });
    if (jErr) return { error: "Failed to assign building. Please try again." };

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
      ip_address: ip,
      meta: {
        building_name: reg.building_name,
        flat_limit: reg.flat_limit,
        trial_ends_at: trialEndsAt,
      },
    });

    revalidatePath("/admin");
    return { email: reg.email };
  } catch (err) {
    // Log the real error server-side; return a generic message to the client
    // to prevent internal schema/stack details leaking to the browser.
    console.error("[register] verifyOTPAndCreate creation error:", err);

    // Compensating rollback — order matters: profile → auth user → bank account → building.
    // Also clear verified_at so the user can retry the whole flow from the OTP step.
    if (createdAuthUserId) {
      try { await adminDb.from("bms_profiles").delete().eq("id", createdAuthUserId); } catch { /* best-effort */ }
      await adminDb.auth.admin.deleteUser(createdAuthUserId).catch(() => {});
    }
    if (createdBankAccountBuildingId) {
      try { await adminDb.from("bms_bank_accounts").delete().eq("building_id", createdBankAccountBuildingId); } catch { /* best-effort */ }
    }
    if (createdBuildingId) {
      try { await adminDb.from("bms_buildings").delete().eq("id", createdBuildingId); } catch { /* best-effort */ }
    }
    // Clear verified_at so user can retry rather than hitting "already verified"
    void adminDb
      .from("bms_self_registrations")
      .update({ verified_at: null })
      .eq("id", input.registration_id);

    return { error: "Something went wrong creating your account. Please try again." };
  }
}

// ─── requestPasswordReset ─────────────────────────────────────────────────────

export async function requestPasswordReset(
  email: string,
): Promise<{ message: string }> {
  const SAFE_MSG = "If an account exists, a reset link has been sent to that address.";

  const ip = await getClientIP();
  const cleanEmail = email.trim().toLowerCase();
  // Return SAFE_MSG even for format errors — don't reveal whether validation
  // passed or failed, to prevent oracle-style probing of what the server accepts.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
    return { message: SAFE_MSG };

  const adminDb = createAdminClient();
  const since = new Date(Date.now() - 3_600_000).toISOString();

  // IP rate limit: 5 per hour — silently succeed to prevent timing oracle
  const { count: ipCount } = await adminDb
    .from("bms_password_resets")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("created_at", since);
  if ((ipCount ?? 0) >= 5) {
    console.warn("[security] Password reset IP rate limit hit", { ip, email: cleanEmail });
    return { message: SAFE_MSG };
  }

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

  console.info("[security] Password reset requested", { email: cleanEmail, ip });
  void writeAuditLog({ actor_id: null, action: "password_reset.requested", entity: "profile", entity_id: profile.id, ip_address: ip, meta: { email: cleanEmail } });

  const { error: emailErr } = await sendPasswordResetEmail(cleanEmail, resetUrl);
  if (emailErr) throw new Error("Failed to send reset email. Please try again.");
  return { message: SAFE_MSG };
}

// ─── resetPassword ────────────────────────────────────────────────────────────

export async function resetPassword(input: {
  token: string;
  email: string;
  password: string;
}): Promise<{ message: string }> {
  if (!input.token?.trim()) throw new Error("Invalid reset link.");
  const pwError = validatePassword(input.password);
  if (pwError) throw new Error(pwError);

  const cleanEmail = input.email.trim().toLowerCase();
  const adminDb = createAdminClient();

  const tokenHash = createHash("sha256").update(input.token.trim()).digest("hex");

  // Atomic claim: mark the token used and retrieve it in one operation.
  // This closes the race condition where two concurrent requests both read
  // used_at IS NULL and both proceed to update the password.
  const { data: claimed } = await adminDb
    .from("bms_password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .eq("email", cleanEmail)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id, email")
    .maybeSingle();

  if (!claimed) throw new Error("Invalid or expired reset link. Please request a new one.");

  const { data: profile } = await adminDb
    .from("bms_profiles")
    .select("id")
    .eq("email", cleanEmail)
    .maybeSingle();
  if (!profile) throw new Error("Account not found.");

  const { error: updateErr } = await adminDb.auth.admin.updateUserById(profile.id, {
    password: input.password,
  });
  if (updateErr) {
    // Roll back the used_at mark so the user can retry with a fresh request
    void adminDb.from("bms_password_resets").update({ used_at: null }).eq("id", claimed.id);
    throw new Error("Failed to update password. Please try again.");
  }

  console.info("[security] Password reset completed", { email: cleanEmail });
  void writeAuditLog({ actor_id: profile.id, actor_email: cleanEmail, action: "password_reset.completed", entity: "profile", entity_id: profile.id, meta: { email: cleanEmail } });

  return { message: "Password updated. You can now sign in with your new password." };
}
