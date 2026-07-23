"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { revalidatePath } from "next/cache";

export type ImportResult = {
  success: number;
  failed: number;
  errors: Array<{ row: number; label: string; message: string }>;
};

function parseDate(str: string): string | null {
  if (!str?.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str.trim())) return str.trim();
  const match = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return null;
}

function parseMoney(str: string): number | null {
  if (!str?.trim()) return null;
  const n = parseFloat(str.replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

// ── Flats ─────────────────────────────────────────────────────────────────────

export async function importFlats(
  rows: Record<string, string>[]
): Promise<ImportResult> {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const result: ImportResult = { success: 0, failed: 0, errors: [] };

  const { data: existing } = await supabase
    .from("bms_flats")
    .select("flat_number")
    .eq("building_id", buildingId);

  const existingNums = new Set(
    (existing ?? []).map((f) => f.flat_number.toLowerCase())
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = row.flat_number?.trim() || `Row ${i + 2}`;

    if (!row.flat_number?.trim()) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: "Flat number is required" });
      continue;
    }

    const num = row.flat_number.trim();

    if (existingNums.has(num.toLowerCase())) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: `Flat "${num}" already exists` });
      continue;
    }

    // Derive ownership_type from import data; default to "owner" (not "vacant")
    // so the flat is billable. Admin can mark genuinely empty units as vacant
    // individually after import.
    const rawOwnership = row.ownership_type?.toLowerCase().trim();
    const ownership_type =
      rawOwnership === "tenant" ? "tenant"
      : rawOwnership === "vacant" ? "vacant"
      : "owner";

    const { error } = await supabase.from("bms_flats").insert({
      building_id:    buildingId,
      flat_number:    num,
      floor:          row.floor ? parseInt(row.floor) : null,
      block:          row.block?.trim() || null,
      size_sqft:      row.size_sqft ? parseFloat(row.size_sqft) : null,
      monthly_fee:    parseMoney(row.monthly_fee ?? ""),
      ownership_type,
      notes:          row.notes?.trim() || null,
    });

    if (error) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: error.message });
    } else {
      result.success++;
      existingNums.add(num.toLowerCase());
    }
  }

  if (result.success > 0) {
    await writeAuditLog({
      actor_id: user.id, actor_email: user.email, actor_role: profile.role,
      building_id: buildingId, action: "import_flats", entity: "flat",
      meta: { imported: result.success, failed: result.failed },
    });
    revalidatePath("/admin/flats");
  }

  return result;
}

// ── Residents ─────────────────────────────────────────────────────────────────

export async function importResidents(
  rows: Record<string, string>[]
): Promise<ImportResult> {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const result: ImportResult = { success: 0, failed: 0, errors: [] };

  const { data: flats } = await supabase
    .from("bms_flats")
    .select("id, flat_number")
    .eq("building_id", buildingId);

  const flatMap = new Map(
    (flats ?? []).map((f) => [f.flat_number.toLowerCase(), f.id])
  );

  // Build a dedup set of existing residents (flatId|name) so re-uploading
  // the same file doesn't create duplicate rows.
  const { data: existingResidents } = await supabase
    .from("bms_residents")
    .select("flat_id, full_name")
    .eq("building_id", buildingId);
  const existingResidentSet = new Set(
    (existingResidents ?? []).map((r) => `${r.flat_id}|${r.full_name.toLowerCase().trim()}`)
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label =
      [row.flat_number, row.full_name].filter(Boolean).join(" — ") ||
      `Row ${i + 2}`;

    if (!row.flat_number?.trim()) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: "Flat number is required" });
      continue;
    }
    if (!row.full_name?.trim()) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: "Full name is required" });
      continue;
    }

    const flatId = flatMap.get(row.flat_number.trim().toLowerCase());
    if (!flatId) {
      result.failed++;
      result.errors.push({
        row: i + 2, label,
        message: `Flat "${row.flat_number}" not found — import flats first`,
      });
      continue;
    }

    // Skip exact duplicates (same flat + same name already exists).
    const dupKey = `${flatId}|${row.full_name.trim().toLowerCase()}`;
    if (existingResidentSet.has(dupKey)) {
      result.errors.push({ row: i + 2, label, message: "Already exists — skipped" });
      continue;
    }

    const rel = row.relationship?.toLowerCase().trim();
    const relationship =
      rel === "tenant" ? "tenant" : rel === "family" ? "family" : "owner";

    const isPrimaryRaw = row.is_primary?.toLowerCase().trim();
    const isPrimary =
      isPrimaryRaw === "yes" || isPrimaryRaw === "1" || isPrimaryRaw === "true";

    if (isPrimary) {
      await supabase
        .from("bms_residents")
        .update({ is_primary: false })
        .eq("flat_id", flatId)
        .eq("building_id", buildingId);
    }

    const { error } = await supabase.from("bms_residents").insert({
      building_id:    buildingId,
      flat_id:        flatId,
      profile_id:     null,
      full_name:      row.full_name.trim(),
      phone:          row.phone?.trim() || null,
      email:          row.email?.trim() || null,
      cnic:           row.cnic?.trim() || null,
      relationship,
      is_primary:     isPrimary,
      move_in_date:   parseDate(row.move_in_date ?? ""),
      entry_fee_paid: parseMoney(row.entry_fee_paid ?? "") ?? 0,
      is_active:      true,
    });

    if (error) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: error.message });
    } else {
      result.success++;
      // Track inserted residents so in-file duplicates (same name twice) are caught.
      existingResidentSet.add(dupKey);
      // Promote flat from "vacant" to the correct occupancy type so it
      // becomes billable. Only upgrade — never downgrade an already-set type
      // (e.g. a second resident on the same flat won't clobber the owner flag).
      const flatOwnershipType = relationship === "tenant" ? "tenant" : "owner";
      await supabase
        .from("bms_flats")
        .update({ ownership_type: flatOwnershipType })
        .eq("id", flatId)
        .eq("building_id", buildingId)
        .eq("ownership_type", "vacant");
    }
  }

  if (result.success > 0) {
    await writeAuditLog({
      actor_id: user.id, actor_email: user.email, actor_role: profile.role,
      building_id: buildingId, action: "import_residents", entity: "resident",
      meta: { imported: result.success, failed: result.failed },
    });
    revalidatePath("/admin/residents");
  }

  return result;
}

// ── Outstanding Dues ──────────────────────────────────────────────────────────

export async function importOutstandingDues(
  rows: Record<string, string>[]
): Promise<ImportResult> {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const result: ImportResult = { success: 0, failed: 0, errors: [] };

  const { data: flats } = await supabase
    .from("bms_flats")
    .select("id, flat_number")
    .eq("building_id", buildingId);

  const flatMap = new Map(
    (flats ?? []).map((f) => [f.flat_number.toLowerCase(), f.id])
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = row.flat_number?.trim() || `Row ${i + 2}`;

    if (!row.flat_number?.trim()) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: "Flat number is required" });
      continue;
    }

    const amount = parseMoney(row.outstanding_dues ?? "");
    if (amount === null || amount < 0) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: "Invalid amount — enter a number e.g. 15000" });
      continue;
    }

    const flatId = flatMap.get(row.flat_number.trim().toLowerCase());
    if (!flatId) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: `Flat "${row.flat_number}" not found` });
      continue;
    }

    const { error } = await supabase
      .from("bms_flats")
      .update({ outstanding_dues: amount })
      .eq("id", flatId)
      .eq("building_id", buildingId);

    if (error) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: error.message });
    } else {
      result.success++;
    }
  }

  if (result.success > 0) {
    await writeAuditLog({
      actor_id: user.id, actor_email: user.email, actor_role: profile.role,
      building_id: buildingId, action: "import_outstanding_dues", entity: "flat",
      meta: { updated: result.success, failed: result.failed },
    });
    revalidatePath("/admin/flats");
  }

  return result;
}

// ── Staff ─────────────────────────────────────────────────────────────────────

const VALID_STAFF_ROLES = [
  "chowkidar", "sweeper", "lift_man", "generator_tech",
  "plumber", "electrician", "other",
];

export async function importStaff(
  rows: Record<string, string>[]
): Promise<ImportResult> {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const result: ImportResult = { success: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = row.full_name?.trim() || `Row ${i + 2}`;

    if (!row.full_name?.trim()) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: "Full name is required" });
      continue;
    }

    const salary = parseMoney(row.monthly_salary ?? "");
    if (salary === null || salary < 0) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: "Monthly salary is required (enter a number)" });
      continue;
    }

    const roleRaw = row.role?.toLowerCase().trim();
    const role = VALID_STAFF_ROLES.includes(roleRaw) ? roleRaw : "other";

    const { error } = await supabase.from("bms_staff").insert({
      building_id:     buildingId,
      full_name:       row.full_name.trim(),
      role,
      phone:           row.phone?.trim() || null,
      cnic:            row.cnic?.trim() || null,
      monthly_salary:  salary,
      join_date:       parseDate(row.join_date ?? ""),
      notes:           row.notes?.trim() || null,
      is_active:       true,
    });

    if (error) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: error.message });
    } else {
      result.success++;
    }
  }

  if (result.success > 0) {
    await writeAuditLog({
      actor_id: user.id, actor_email: user.email, actor_role: profile.role,
      building_id: buildingId, action: "import_staff", entity: "staff",
      meta: { imported: result.success, failed: result.failed },
    });
    revalidatePath("/admin/staff");
  }

  return result;
}

// ── Vehicles ──────────────────────────────────────────────────────────────────

const VALID_VEHICLE_TYPES = ["car", "bike", "ev", "other"];

export async function importVehicles(
  rows: Record<string, string>[]
): Promise<ImportResult> {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const result: ImportResult = { success: 0, failed: 0, errors: [] };

  const { data: flats } = await supabase
    .from("bms_flats")
    .select("id, flat_number")
    .eq("building_id", buildingId);

  const flatMap = new Map(
    (flats ?? []).map((f) => [f.flat_number.toLowerCase(), f.id])
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label =
      [row.flat_number, row.plate_number].filter(Boolean).join(" — ") ||
      `Row ${i + 2}`;

    if (!row.flat_number?.trim()) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: "Flat number is required" });
      continue;
    }
    if (!row.plate_number?.trim()) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: "Plate number is required" });
      continue;
    }

    const flatId = flatMap.get(row.flat_number.trim().toLowerCase());
    if (!flatId) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: `Flat "${row.flat_number}" not found` });
      continue;
    }

    const typeRaw = row.vehicle_type?.toLowerCase().trim();
    const vehicle_type = VALID_VEHICLE_TYPES.includes(typeRaw) ? typeRaw : "car";

    const { error } = await supabase.from("bms_vehicles").insert({
      building_id:  buildingId,
      flat_id:      flatId,
      resident_id:  null,
      plate_number: row.plate_number.trim().toUpperCase(),
      vehicle_type,
      make:         row.make?.trim() || null,
      model:        row.model?.trim() || null,
      color:        row.color?.trim() || null,
      is_primary:   false,
      notes:        row.notes?.trim() || null,
    });

    if (error) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: error.message });
    } else {
      result.success++;
    }
  }

  if (result.success > 0) {
    await writeAuditLog({
      actor_id: user.id, actor_email: user.email, actor_role: profile.role,
      building_id: buildingId, action: "import_vehicles", entity: "vehicle",
      meta: { imported: result.success, failed: result.failed },
    });
    revalidatePath("/admin/vehicles");
  }

  return result;
}

// ── Bill Accounts ─────────────────────────────────────────────────────────────

export async function importBillAccounts(
  rows: Record<string, string>[]
): Promise<ImportResult> {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const result: ImportResult = { success: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = row.nickname?.trim() || row.provider?.trim() || `Row ${i + 2}`;

    if (!row.provider?.trim()) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: "Provider is required" });
      continue;
    }
    if (!row.nickname?.trim()) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: "Nickname is required" });
      continue;
    }
    if (!row.account_number?.trim()) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: "Account number is required" });
      continue;
    }

    const provider = row.provider.trim().toLowerCase();
    const provider_label =
      provider === "other" ? (row.custom_provider?.trim() || row.nickname.trim()) : null;

    if (provider === "other" && !provider_label) {
      result.failed++;
      result.errors.push({
        row: i + 2, label,
        message: "Fill custom_provider column when provider is 'other'",
      });
      continue;
    }

    const { error } = await supabase.from("bms_bill_accounts").insert({
      building_id:    buildingId,
      provider,
      provider_label,
      nickname:       row.nickname.trim(),
      account_number: row.account_number.trim(),
      location:       row.location?.trim() || null,
      notes:          row.notes?.trim() || null,
      is_active:      true,
    });

    if (error) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: error.message });
    } else {
      result.success++;
    }
  }

  if (result.success > 0) {
    await writeAuditLog({
      actor_id: user.id, actor_email: user.email, actor_role: profile.role,
      building_id: buildingId, action: "import_bill_accounts", entity: "bill_account",
      meta: { imported: result.success, failed: result.failed },
    });
    revalidatePath("/admin/bill-accounts");
  }

  return result;
}

// ── Bank Accounts ─────────────────────────────────────────────────────────────

export async function importBankAccounts(
  rows: Record<string, string>[]
): Promise<ImportResult> {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const result: ImportResult = { success: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = row.name?.trim() || `Row ${i + 2}`;

    if (!row.name?.trim()) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: "Account name is required" });
      continue;
    }

    const typeRaw = row.type?.toLowerCase().trim();
    const type = typeRaw === "cash" ? "cash" : "bank";

    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase.from("bms_bank_accounts").insert({
      building_id:           buildingId,
      name:                  row.name.trim(),
      type,
      account_number_masked: row.account_number?.trim() || null,
      opening_balance:       0,
      opening_balance_date:  today,
      is_active:             true,
    });

    if (error) {
      result.failed++;
      result.errors.push({ row: i + 2, label, message: error.message });
    } else {
      result.success++;
    }
  }

  if (result.success > 0) {
    await writeAuditLog({
      actor_id: user.id, actor_email: user.email, actor_role: profile.role,
      building_id: buildingId, action: "import_bank_accounts", entity: "bank_account",
      meta: { imported: result.success, failed: result.failed },
    });
    revalidatePath("/admin/settings");
  }

  return result;
}

// ── Export helpers ────────────────────────────────────────────────────────────

export async function exportFlats(): Promise<Record<string, unknown>[]> {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bms_flats")
    .select("flat_number, floor, block, size_sqft, monthly_fee, outstanding_dues, notes")
    .eq("building_id", buildingId)
    .order("flat_number");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function exportResidents(): Promise<Record<string, unknown>[]> {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bms_residents")
    .select(`
      full_name, phone, email, cnic, relationship, is_primary,
      move_in_date, entry_fee_paid,
      bms_flats!inner(flat_number)
    `)
    .eq("building_id", buildingId)
    .eq("is_active", true)
    .order("full_name");

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    flat_number:    (r.bms_flats as unknown as { flat_number: string } | null)?.flat_number ?? "",
    full_name:      r.full_name,
    relationship:   r.relationship,
    phone:          r.phone ?? "",
    cnic:           r.cnic ?? "",
    email:          r.email ?? "",
    move_in_date:   r.move_in_date ?? "",
    entry_fee_paid: r.entry_fee_paid,
    is_primary:     r.is_primary ? "yes" : "no",
  }));
}
