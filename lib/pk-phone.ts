// Pakistani phone normalization for the Sales CRM / leads module.
//
// We deliberately do NOT reuse lib/phone.ts because that helper canonicalises
// to "03xxxxxxxxx" (11 digits, leading 0) for the auth/login layer. For the
// CRM and WhatsApp deeplinks we want the international form "923xxxxxxxxx"
// (12 digits) because that's what wa.me expects.
//
// Accepts loose input:
//   "+92 331-1000006", "923311000006", "0331 1000006",
//   "0331-1000006", "03311000006", "3311000006"
//
// Returns canonical "923xxxxxxxxx" — or throws if the digits don't parse.

export function normalizePkPhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  // 03xxxxxxxxx → 923xxxxxxxxx
  if (digits.startsWith("03") && digits.length === 11) {
    return "92" + digits.slice(1);
  }
  // 3xxxxxxxxx → 923xxxxxxxxx
  if (digits.startsWith("3") && digits.length === 10) {
    return "92" + digits;
  }
  // Already 923xxxxxxxxx
  if (digits.startsWith("92") && digits.length === 12) return digits;
  // Anything else: return digits as-is — caller should validate length.
  return digits;
}

/**
 * Validate the canonical 12-digit international form. Use after normalize.
 */
export function isValidPkPhone(canonical: string): boolean {
  if (canonical.length < 10 || canonical.length > 15) return false;
  // Strongest signal: PK mobile = 923xxxxxxxxx (12 digits).
  if (canonical.startsWith("92") && canonical.length === 12) return true;
  // Allow other intl numbers (10–15 digits) for non-PK contacts.
  return /^\d{10,15}$/.test(canonical);
}

/**
 * Render a canonical 12-digit "923xxxxxxxxx" as "+92 300 123 4567".
 * Falls back to raw input if the format doesn't match.
 */
export function displayPkPhone(canonical: string): string {
  if (canonical?.startsWith("92") && canonical.length === 12) {
    return `+92 ${canonical.slice(2, 5)} ${canonical.slice(5, 8)} ${canonical.slice(8)}`;
  }
  if (canonical?.length === 11 && canonical.startsWith("0")) {
    // Fallback if someone stored 03xxxxxxxxx — display it cleanly.
    return `${canonical.slice(0, 4)}-${canonical.slice(4)}`;
  }
  return canonical ?? "";
}
