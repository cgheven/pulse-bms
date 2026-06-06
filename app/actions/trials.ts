"use server";

import { randomBytes } from "crypto";
import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import type { TrialDurationDays } from "@/types";

// ─── Private helpers ──────────────────────────────────────────────────────────

function generateTrialEmail(): string {
  const suffix = randomBytes(5).toString("hex");
  return `trial-${suffix}@demo.pulsebms.app`;
}

function generatePassword(): string {
  // Skip confusables (0/O, I/l/1) so credentials are easy to read and share.
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}

// ─── Rate limit guard (max 10 buildings created per user per 24 h) ────────────

async function assertDailyRateLimit(userId: string): Promise<void> {
  const adminDb = createAdminClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error } = await adminDb
    .from("bms_buildings")
    .select("id", { count: "exact", head: true })
    .eq("trial_created_by", userId)
    .gte("created_at", since);
  if (error) throw new Error("Could not verify rate limit.");
  if ((count ?? 0) >= 10) {
    throw new Error("Daily building creation limit reached (10 per day). Contact a super admin if you need more.");
  }
}

// ─── Exported actions ─────────────────────────────────────────────────────────

export async function createTrialBuilding(input: {
  building_name: string;
  city?: string | null;
  flat_limit?: number | null;
  duration_days: TrialDurationDays;
  contact_name?: string | null;
  contact_email?: string | null;
  lead_id?: string | null;
}) {
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();
  await assertDailyRateLimit(user.id);

  const name = input.building_name?.trim();
  if (!name) throw new Error("Building name is required.");
  if (![7, 15, 30].includes(input.duration_days)) {
    throw new Error("Trial duration must be 7, 15, or 30 days.");
  }

  const flatLimit = Math.max(1, Math.round(input.flat_limit ?? 99));

  const rawEmail = input.contact_email?.trim().toLowerCase();
  if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    throw new Error("Please enter a valid email address.");
  }
  const email = rawEmail || generateTrialEmail();
  const password = generatePassword();

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + input.duration_days * 24 * 60 * 60 * 1000).toISOString();
  const today = now.toISOString().slice(0, 10);

  const adminDb = createAdminClient();
  const supabase = await createClient();

  let createdBuildingId: string | null = null;
  let createdAuthUserId: string | null = null;

  try {
    // 1. Building
    const { data: building, error: bErr } = await adminDb
      .from("bms_buildings")
      .insert({
        name,
        city: input.city?.trim() || "Karachi",
        address: null,
        total_flats: 0,
        flat_limit: flatLimit,
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
        trial_duration_days: input.duration_days,
        trial_created_by: user.id,
      })
      .select("id")
      .single();
    if (bErr || !building) throw new Error(bErr?.message || "Failed to create trial building.");
    createdBuildingId = building.id;

    // 2. Default Cash account
    const { error: baErr } = await adminDb.from("bms_bank_accounts").insert({
      building_id: building.id,
      name: "Cash",
      type: "cash",
      opening_balance: 0,
      opening_balance_date: today,
      is_active: true,
    });
    if (baErr) throw new Error(`Failed to create Cash account: ${baErr.message}`);

    const contactName = input.contact_name?.trim() || null;

    // 3. Auth user
    const { data: authData, error: authErr } = await adminDb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: contactName ?? "Trial Admin" },
    });
    if (authErr || !authData?.user) throw new Error(authErr?.message || "Failed to create trial admin user.");
    createdAuthUserId = authData.user.id;

    // 4. Profile (upsert — auth trigger may pre-create a skeleton row)
    const { error: profErr } = await adminDb.from("bms_profiles").upsert({
      id: authData.user.id,
      email,
      full_name: contactName ?? "Trial Admin",
      role: "admin",
      building_id: building.id,
      is_active: true,
      is_demo: false,
    }, { onConflict: "id" });
    if (profErr) throw new Error(`Failed to create profile: ${profErr.message}`);

    // 5. Junction: admin → building
    const { error: jErr } = await adminDb.from("bms_admin_buildings").insert({
      profile_id: authData.user.id,
      building_id: building.id,
      is_primary: true,
    });
    if (jErr) throw new Error(`Failed to assign building: ${jErr.message}`);

    // 6. Store credentials (plaintext acceptable — trial buildings have no real resident data)
    const { error: credErr } = await adminDb.from("bms_trial_credentials").insert({
      building_id: building.id,
      admin_profile_id: authData.user.id,
      login_email: email,
      login_password: password,
      created_by: user.id,
    });
    if (credErr) throw new Error(`Failed to store credentials: ${credErr.message}`);

    // 7. Optionally log demo activity on the lead
    if (input.lead_id) {
      await supabase.from("bms_lead_activities").insert({
        lead_id: input.lead_id,
        activity_type: "demo",
        note: `Demo building created: ${name}`,
        actor_id: user.id,
      });
    }

    await writeAuditLog({
      actor_id: user.id,
      actor_email: user.email,
      actor_role: profile.role,
      building_id: building.id,
      action: "trial.create",
      entity: "building",
      entity_id: building.id,
      meta: {
        building_name: name,
        flat_limit: flatLimit,
        duration_days: input.duration_days,
        contact_name: contactName,
        email,
        trial_ends_at: trialEndsAt,
        lead_id: input.lead_id ?? null,
      },
    });

    revalidatePath("/super-admin/trials");
    revalidatePath("/super-admin");

    return { building_id: building.id, email, password, trial_ends_at: trialEndsAt };
  } catch (err) {
    // Compensate: delete building first (cascades child rows), then profile, then auth user
    if (createdBuildingId) {
      try { await adminDb.from("bms_buildings").delete().eq("id", createdBuildingId); }
      catch (e) { console.error("Cleanup: building delete failed", e); }
    }
    if (createdAuthUserId) {
      try { await adminDb.from("bms_profiles").delete().eq("id", createdAuthUserId); }
      catch (e) { console.error("Cleanup: profile delete failed", e); }
      await adminDb.auth.admin.deleteUser(createdAuthUserId).catch((e) =>
        console.error("Cleanup: auth user delete failed", e),
      );
    }
    throw err;
  }
}

export async function createProductionBuilding(input: {
  building_name: string;
  city?: string | null;
  flat_limit?: number | null;
  pulse_monthly_charge?: number | null;
  admin_name: string;
  admin_email: string;
}) {
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();
  await assertDailyRateLimit(user.id);

  const name = input.building_name?.trim();
  if (!name) throw new Error("Building name is required.");

  const email = input.admin_email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid admin email address is required.");
  }

  const adminName = input.admin_name?.trim();
  if (!adminName) throw new Error("Admin name is required.");

  const flatLimit = Math.max(1, Math.round(input.flat_limit ?? 99));
  const password = generatePassword();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const adminDb = createAdminClient();
  let createdBuildingId: string | null = null;
  let createdAuthUserId: string | null = null;

  try {
    // 1. Building (trial_created_by tracks creator for the sales buildings page)
    const { data: building, error: bErr } = await adminDb
      .from("bms_buildings")
      .insert({
        name,
        city: input.city?.trim() || "Karachi",
        address: null,
        total_flats: 0,
        flat_limit: flatLimit,
        entry_fee_owner: 10000,
        entry_fee_tenant: 5000,
        monthly_fee_default: 3000,
        voting_rule: "majority",
        utility_cutoff_after_months: 3,
        is_active: true,
        fund_balance: 0,
        opening_balance_amount: 0,
        opening_balance_date: today,
        is_trial: false,
        trial_ends_at: null,
        trial_duration_days: null,
        trial_created_by: user.id,
        pulse_monthly_charge: input.pulse_monthly_charge ?? null,
      })
      .select("id")
      .single();
    if (bErr || !building) throw new Error(bErr?.message || "Failed to create building.");
    createdBuildingId = building.id;

    // 2. Default Cash account
    const { error: baErr } = await adminDb.from("bms_bank_accounts").insert({
      building_id: building.id,
      name: "Cash",
      type: "cash",
      opening_balance: 0,
      opening_balance_date: today,
      is_active: true,
    });
    if (baErr) throw new Error(`Failed to create Cash account: ${baErr.message}`);

    // 3. Auth user
    const { data: authData, error: authErr } = await adminDb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: adminName },
    });
    if (authErr || !authData?.user) throw new Error(authErr?.message || "Failed to create admin user.");
    createdAuthUserId = authData.user.id;

    // 4. Profile
    const { error: profErr } = await adminDb.from("bms_profiles").upsert({
      id: authData.user.id,
      email,
      full_name: adminName,
      role: "admin",
      building_id: building.id,
      is_active: true,
      is_demo: false,
    }, { onConflict: "id" });
    if (profErr) throw new Error(`Failed to create profile: ${profErr.message}`);

    // 5. Junction
    const { error: jErr } = await adminDb.from("bms_admin_buildings").insert({
      profile_id: authData.user.id,
      building_id: building.id,
      is_primary: true,
    });
    if (jErr) throw new Error(`Failed to assign building: ${jErr.message}`);

    // NOTE: Credentials are NOT persisted for production buildings.
    // The plaintext password is returned once here for immediate sharing.
    // The admin should set their own password after first login.

    await writeAuditLog({
      actor_id: user.id,
      actor_email: user.email,
      actor_role: profile.role,
      building_id: building.id,
      action: "building.create",
      entity: "building",
      entity_id: building.id,
      meta: { building_name: name, flat_limit: flatLimit, admin_email: email, admin_name: adminName },
    });

    revalidatePath("/super-admin/trials");
    revalidatePath("/super-admin/buildings");
    revalidatePath("/super-admin");

    return { building_id: building.id, email, password, trial_ends_at: null as string | null };
  } catch (err) {
    // Compensate: building → profile → auth user (in dependency order)
    if (createdBuildingId) {
      try { await adminDb.from("bms_buildings").delete().eq("id", createdBuildingId); }
      catch (e) { console.error("Cleanup: building delete failed", e); }
    }
    if (createdAuthUserId) {
      try { await adminDb.from("bms_profiles").delete().eq("id", createdAuthUserId); }
      catch (e) { console.error("Cleanup: profile delete failed", e); }
      await adminDb.auth.admin.deleteUser(createdAuthUserId).catch((e) =>
        console.error("Cleanup: auth user delete failed", e),
      );
    }
    throw err;
  }
}

export async function extendTrial(building_id: string, additional_days: TrialDurationDays) {
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();

  if (!building_id) throw new Error("Building ID is required.");
  if (![7, 15, 30].includes(additional_days)) {
    throw new Error("Extension must be 7, 15, or 30 days.");
  }

  const adminDb = createAdminClient();

  const { data: building, error: loadErr } = await adminDb
    .from("bms_buildings")
    .select("id, name, is_trial, trial_ends_at, trial_duration_days, trial_created_by")
    .eq("id", building_id)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!building) throw new Error("Building not found.");
  if (!building.is_trial) throw new Error("This building is not a trial.");

  // Ownership check: sales users can only extend their own buildings
  if (profile.role === "sales" && building.trial_created_by !== user.id) {
    throw new Error("Access denied.");
  }

  const now = new Date();
  const currentEnd = building.trial_ends_at ? new Date(building.trial_ends_at) : now;
  const baseMs = Math.max(currentEnd.getTime(), now.getTime());
  const newEndsAt = new Date(baseMs + additional_days * 24 * 60 * 60 * 1000).toISOString();
  const totalDays = (building.trial_duration_days ?? 0) + additional_days;

  const { data: updated, error: updateErr } = await adminDb
    .from("bms_buildings")
    .update({ trial_ends_at: newEndsAt, trial_duration_days: totalDays })
    .eq("id", building_id)
    .select()
    .single();
  if (updateErr) throw new Error(updateErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id,
    action: "trial.extend",
    entity: "building",
    entity_id: building_id,
    meta: {
      additional_days,
      old_ends_at: building.trial_ends_at,
      new_ends_at: newEndsAt,
    },
  });

  revalidatePath("/super-admin/trials");
  revalidatePath("/super-admin");
  // Refresh the admin-side trial banner immediately
  revalidatePath("/admin", "layout");
  return updated;
}

export async function deactivateTrialBuilding(building_id: string) {
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();

  if (!building_id) throw new Error("Building ID is required.");

  const adminDb = createAdminClient();

  // Load building first — required for ownership check and to verify is_trial
  const { data: building, error: loadErr } = await adminDb
    .from("bms_buildings")
    .select("id, name, is_trial, is_active, trial_created_by")
    .eq("id", building_id)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!building) throw new Error("Building not found.");

  // This action is for trial buildings only. Production buildings must use
  // the Buildings management page (setBuildingActive action).
  if (!building.is_trial) {
    throw new Error("This building is not a trial. Use the Buildings management page to manage production buildings.");
  }

  // Ownership check: sales users can only deactivate their own buildings
  if (profile.role === "sales" && building.trial_created_by !== user.id) {
    throw new Error("Access denied.");
  }

  const { data: updated, error } = await adminDb
    .from("bms_buildings")
    .update({ is_active: false })
    .eq("id", building_id)
    .select("id")
    .single();
  if (error || !updated) throw new Error("Failed to deactivate building.");

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id,
    action: building.is_trial ? "trial.deactivate" : "building.deactivate",
    entity: "building",
    entity_id: building_id,
    meta: { building_name: building.name },
  });

  revalidatePath("/super-admin/trials");
  revalidatePath("/admin", "layout");
}

export async function convertToProduction(
  building_id: string,
  opts: { flat_limit?: number; pulse_monthly_charge?: number | null; reset_password: boolean },
) {
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();

  if (!building_id) throw new Error("Building ID is required.");

  const adminDb = createAdminClient();

  // Load building + credentials in one pass
  const { data: building, error: loadErr } = await adminDb
    .from("bms_buildings")
    .select("id, name, is_trial, is_active, flat_limit, trial_created_by, bms_trial_credentials(admin_profile_id, login_email)")
    .eq("id", building_id)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!building) throw new Error("Building not found.");
  if (!building.is_trial) throw new Error("This building is already a production building.");

  // Ownership check
  if (profile.role === "sales" && building.trial_created_by !== user.id) {
    throw new Error("Access denied.");
  }

  const newFlatLimit =
    opts.flat_limit != null
      ? Math.max(1, Math.round(opts.flat_limit))
      : building.flat_limit;

  // Promote: clear trial flags
  const { error: updateErr } = await adminDb
    .from("bms_buildings")
    .update({
      is_trial: false,
      trial_ends_at: null,
      trial_duration_days: null,
      flat_limit: newFlatLimit,
      is_active: true,
      ...(opts.pulse_monthly_charge !== undefined
        ? { pulse_monthly_charge: opts.pulse_monthly_charge }
        : {}),
    })
    .eq("id", building_id);
  if (updateErr) throw new Error(`Failed to convert building: ${updateErr.message}`);

  const cred = Array.isArray(building.bms_trial_credentials)
    ? building.bms_trial_credentials[0]
    : building.bms_trial_credentials;
  const adminProfileId = cred?.admin_profile_id ?? null;
  const adminEmail = cred?.login_email ?? null;

  let newPassword: string | null = null;

  if (opts.reset_password && adminProfileId) {
    newPassword = generatePassword();
    const { error: pwErr } = await adminDb.auth.admin.updateUserById(adminProfileId, {
      password: newPassword,
    });
    if (pwErr) throw new Error(`Failed to reset password: ${pwErr.message}`);
    // Keep the credential record in sync so sales can always retrieve the current password
    const { error: credUpdateErr } = await adminDb
      .from("bms_trial_credentials")
      .update({ login_password: newPassword })
      .eq("building_id", building_id);
    if (credUpdateErr) {
      console.error("Credential record update failed:", credUpdateErr.message);
    }
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id,
    action: "trial.convert_to_production",
    entity: "building",
    entity_id: building_id,
    meta: {
      building_name: building.name,
      flat_limit: newFlatLimit,
      password_reset: opts.reset_password,
      admin_email: adminEmail,
    },
  });

  revalidatePath("/super-admin/trials");
  revalidatePath("/super-admin/buildings");
  revalidatePath("/super-admin");
  revalidatePath("/admin", "layout");

  return {
    building_name: building.name,
    email: adminEmail,
    password: newPassword,
  };
}

export async function updateBuildingCharge(
  building_id: string,
  pulse_monthly_charge: number | null,
) {
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();

  if (!building_id) throw new Error("Building ID is required.");

  const adminDb = createAdminClient();

  const { data: building, error: loadErr } = await adminDb
    .from("bms_buildings")
    .select("id, name, trial_created_by")
    .eq("id", building_id)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!building) throw new Error("Building not found.");

  if (profile.role === "sales" && building.trial_created_by !== user.id) {
    throw new Error("Access denied.");
  }

  const { error } = await adminDb
    .from("bms_buildings")
    .update({ pulse_monthly_charge })
    .eq("id", building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id,
    action: "building.update_charge",
    entity: "building",
    entity_id: building_id,
    meta: { pulse_monthly_charge },
  });

  revalidatePath("/super-admin/trials");
}
