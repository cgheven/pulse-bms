"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { revalidatePath } from "next/cache";
import { maskAccountNumber } from "@/lib/banks";

export type BankAccountInput = {
  /**
   * DERIVED, not asked for. A bank account is identified by its bank +
   * account number and a cash drawer is just "Cash", so a free-text name only
   * ever creates contradictions ("Cash" of type bank, holding HBL details).
   * Kept as a column because it is NOT NULL and older rows rely on it.
   */
  name?: string;
  type: "cash" | "bank";
  /** Bank the account is held with — HBL, UBL, … NULL for cash. */
  bank_name?: string | null;
  /** Title as printed on the cheque book. */
  account_title?: string | null;
  /**
   * FULL account number. Deliberately not masked: a society publishes its own
   * collection account so residents can transfer into it. The legacy
   * `account_number_masked` column is derived from this on write so anything
   * still reading it keeps working.
   */
  account_number?: string | null;
  iban?: string | null;
  account_number_masked?: string | null;
  opening_balance: number;
  opening_balance_date: string;
  is_active?: boolean;
};

/**
 * Normalise the bank fields shared by create + update.
 *
 * A cash account has no bank details, so they are forced to NULL rather than
 * left as stale strings if someone flips an account from bank to cash.
 */
function normaliseBankFields<T extends Partial<BankAccountInput>>(input: T): T {
  const out = { ...input };
  // Name follows the type — never the other way round.
  if (out.type === "cash") out.name = "Cash";
  else if (out.type === "bank") out.name = out.bank_name?.trim() || "Bank";
  if (out.type === "cash") {
    out.bank_name = null;
    out.account_title = null;
    out.account_number = null;
    out.iban = null;
    out.account_number_masked = null;
    return out;
  }
  if ("bank_name" in out) out.bank_name = out.bank_name?.trim() || null;
  if ("account_title" in out) out.account_title = out.account_title?.trim() || null;
  if ("iban" in out) out.iban = out.iban?.trim().toUpperCase().replace(/\s+/g, "") || null;
  if ("account_number" in out) {
    const full = out.account_number?.trim() || null;
    out.account_number = full;
    // Keep the legacy masked column in step so older read paths still work.
    out.account_number_masked = maskAccountNumber(full);
  }
  return out;
}

export async function createBankAccount(input: BankAccountInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  // Per-bank opening_balance is locked to 0 — society-wide opening is
  // managed once via Settings → Opening Balance. Forcing 0 here prevents
  // an API bypass from creating a double-count in the "All combined"
  // reports view, where the building opening is already added.
  const normalised = normaliseBankFields(input);

  const { data, error } = await supabase
    .from("bms_bank_accounts")
    .insert({
      building_id: buildingId,
      name: normalised.name?.trim() || "Cash",
      type: input.type,
      bank_name: normalised.bank_name ?? null,
      account_title: normalised.account_title ?? null,
      account_number: normalised.account_number ?? null,
      iban: normalised.iban ?? null,
      account_number_masked:
        normalised.account_number_masked?.trim() || null,
      opening_balance: 0,
      opening_balance_date: input.opening_balance_date,
      is_active: input.is_active ?? true,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "bank_account.create",
    entity: "bank_account",
    entity_id: data.id,
    meta: { ...input, opening_balance: 0 } as unknown as Record<string, unknown>,
  });

  revalidatePath("/admin/settings/bank-accounts");
  revalidatePath("/admin/reports", "layout");
  return data;
}

export async function updateBankAccount(
  id: string,
  input: Partial<BankAccountInput>,
) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  // Per-bank opening_balance is locked to 0 — society-wide opening is
  // managed via Settings → Opening Balance. Strip any caller-supplied
  // value (or coerce to 0 if explicitly present) before the update so an
  // API bypass cannot reintroduce double-counting in reports.
  const sanitized: Partial<BankAccountInput> = normaliseBankFields(input);
  if ("opening_balance" in sanitized) {
    sanitized.opening_balance = 0;
  }

  // Changing cash <-> bank on an account that already has movement silently
  // reclassifies every payment and expense booked into it — a cash drawer
  // becomes an HBL account and the cash/bank split in the day book and cash
  // position is wrong from then on. Blocked; add a separate account instead.
  if (sanitized.type) {
    const { data: existing } = await supabase
      .from("bms_bank_accounts")
      .select("type")
      .eq("id", id)
      .eq("building_id", buildingId)
      .maybeSingle();
    if (existing && existing.type !== sanitized.type) {
      const [{ count: payCount }, { count: expCount }] = await Promise.all([
        supabase
          .from("bms_payments")
          .select("id", { count: "exact", head: true })
          .eq("building_id", buildingId)
          .eq("bank_account_id", id),
        supabase
          .from("bms_expenses")
          .select("id", { count: "exact", head: true })
          .eq("building_id", buildingId)
          .eq("bank_account_id", id),
      ]);
      const moved = (payCount ?? 0) + (expCount ?? 0);
      if (moved > 0) {
        throw new Error(
          `This account already has ${moved} payment${
            moved === 1 ? "" : "s"
          } / expense${moved === 1 ? "" : "s"} booked into it, so it cannot be ` +
            `switched between Cash and Bank — that would reclassify all of them. ` +
            `Add a separate account instead.`,
        );
      }
    }
  }

  const { data, error } = await supabase
    .from("bms_bank_accounts")
    .update(sanitized)
    .eq("id", id)
    .eq("building_id", buildingId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "bank_account.update",
    entity: "bank_account",
    entity_id: id,
    meta: sanitized as Record<string, unknown>,
  });

  revalidatePath("/admin/settings/bank-accounts");
  revalidatePath("/admin/reports", "layout");
  return data;
}

export async function deactivateBankAccount(id: string) {
  // Soft-delete via is_active=false so historical payments / expenses
  // still resolve their FK and reports stay accurate. We never hard-delete
  // a bank account that has movement history attached.
  return updateBankAccount(id, { is_active: false });
}
