// Pakistani mobile number utilities.
//
// Canonical = "03xxxxxxxxx" (11 digits, leading 0). This is what users type,
// what we store in bms_profiles.phone, and what the welcome message shows.
//
// Accepts variations during input:
//   "+92 331-1000006", "923311000006", "0331 1000006", "0331-1000006", "03311000006"
//
// Returns canonical "03311000006" — or null when the digits don't parse to a
// valid 11-digit Pakistani mobile.

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, "");
  if (!digits) return null;

  // +923311000006 / 923311000006 -> 03311000006
  if (digits.length === 12 && digits.startsWith("92")) {
    return "0" + digits.slice(2);
  }
  // 03311000006 (already canonical)
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits;
  }
  // 3311000006 (missing the leading 0, accept it)
  if (digits.length === 10 && digits.startsWith("3")) {
    return "0" + digits;
  }
  return null;
}

// "03311000006" -> "0331-1000006" for human display.
export function displayPhone(canonical: string | null | undefined): string {
  if (!canonical || canonical.length !== 11) return canonical ?? "";
  return `${canonical.slice(0, 4)}-${canonical.slice(4)}`;
}

// "03311000006" -> "923311000006" (no +) for wa.me / sms: URLs.
export function toIntlNoPlus(canonical: string | null | undefined): string | null {
  if (!canonical || canonical.length !== 11 || !canonical.startsWith("0")) {
    return null;
  }
  return "92" + canonical.slice(1);
}

// "03311000006" -> "03311000006@bms.local" — opaque login key for Supabase auth
// when the user only has a mobile (no real email).
export function syntheticEmailFromPhone(canonical: string): string {
  return `${canonical}@bms.local`;
}

// Strip our synthetic domain so we don't surface "@bms.local" anywhere user-facing.
export function isSyntheticEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith("@bms.local");
}
