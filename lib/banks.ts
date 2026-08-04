/**
 * Banks a Pakistani society is realistically going to hold its collection
 * account with. Free text is still allowed via "Other" — the stored value is
 * whatever string ends up in bms_bank_accounts.bank_name, so this list is a
 * convenience, not a constraint.
 */
export const PK_BANKS = [
  "HBL",
  "UBL",
  "MCB",
  "Meezan Bank",
  "Bank Alfalah",
  "Allied Bank",
  "Askari Bank",
  "Bank Al Habib",
  "Faysal Bank",
  "JS Bank",
  "Standard Chartered",
  "Soneri Bank",
  "Habib Metro",
  "Sindh Bank",
  "National Bank of Pakistan",
  "Bank of Punjab",
  "Dubai Islamic Bank",
  "Al Baraka",
  "Summit Bank",
  "Silkbank",
  "Easypaisa",
  "JazzCash",
] as const;

/** Sentinel for the free-text option in the bank picker. */
export const BANK_OTHER = "__other__";

/**
 * How an account is shown wherever the recorder has to CHOOSE a destination
 * ("Paid into" on Record Payment, "Paid from" on Add Expense).
 *
 * Bank + title only. The account number is deliberately left out: picking a
 * destination is a recognition task, and a 16-digit number is noise there —
 * the recorder knows the society banks with HBL, not the digits. The full
 * number still lives on Settings → Bank Accounts, which is where it is
 * managed and where residents are shown where to transfer.
 *
 * Falls back through what is filled in, because accounts created before the
 * bank-details migration only have `name`:
 *   HBL — PULSEHUB SMC
 *   HBL
 *   Legacy Bank        (pre-migration row, name only)
 *   Cash
 */
export function bankAccountLabel(a: {
  name: string;
  type: "cash" | "bank";
  bank_name?: string | null;
  account_title?: string | null;
}): string {
  if (a.type === "cash") return a.name || "Cash";
  const parts = [a.bank_name?.trim() || a.name, a.account_title?.trim()];
  return parts.filter(Boolean).join(" — ");
}

/** Last 4 digits of a full account number, for the legacy masked column. */
export function maskAccountNumber(full: string | null | undefined): string | null {
  const digits = (full ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : digits || null;
}
