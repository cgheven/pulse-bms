// ============================================================
// Pulse BMS — City-scoped utility / vendor providers
//
// The provider dropdown on Bill Accounts is filtered by the building's
// `city` (lowercased key). Karachi-only in v1; new cities slot in here
// by adding another entry to PROVIDERS_BY_CITY.
//
// Every city implicitly gets the "Other (custom)" fallback at the bottom
// of the list so societies in less-covered cities can still record
// providers we don't ship a preset for. When provider='other', the UI
// requires a custom provider_label.
// ============================================================

// Quick-add provider keys per city — surfaced as one-tap chips at the top
// of the Bill Accounts page. Each chip pre-fills the dialog so admin only
// types account number + nickname. Order matters (most common first).
export const QUICK_ADD_BY_CITY: Record<string, string[]> = {
  karachi: ["k_electric", "ssgc", "kwsb", "nayatel", "ptcl", "stormfiber"],
};

export function getQuickAddProvidersForCity(city: string | null | undefined): string[] {
  const k = (city ?? "").toLowerCase().trim();
  return QUICK_ADD_BY_CITY[k] ?? [];
}

export type ProviderCategory =
  | "electricity"
  | "gas"
  | "water"
  | "internet"
  | "mobile"
  | "lift_amc"
  | "security_amc"
  | "other";

export type Provider = {
  /** Stable machine key persisted to bms_bill_accounts.provider. */
  key: string;
  /** Human-readable label shown in pickers + reports. */
  label: string;
  /** Group heading on the dropdown. */
  category: ProviderCategory;
};

export const CATEGORY_LABEL: Record<ProviderCategory, string> = {
  electricity: "Electricity",
  gas: "Gas",
  water: "Water",
  internet: "Internet",
  mobile: "Mobile / PRI",
  lift_amc: "Lift AMC",
  security_amc: "Security / Guards",
  other: "Other",
};

/** Custom fallback row — appended to every city's list. */
export const COMMON_FALLBACK: Provider[] = [
  { key: "other", label: "Other (custom)", category: "other" },
];

/**
 * City key → preset provider list. Keys are lowercase canonical city
 * names. Lookup helper below tolerates casing + extra whitespace.
 */
export const PROVIDERS_BY_CITY: Record<string, Provider[]> = {
  karachi: [
    // Electricity — KE is the only utility for Karachi
    { key: "k_electric", label: "K-Electric", category: "electricity" },

    // Gas
    { key: "ssgc", label: "SSGC", category: "gas" },

    // Water
    { key: "kwsb", label: "KW&SB (Water Board)", category: "water" },
    { key: "water_tanker", label: "Water Tanker (private)", category: "water" },

    // Internet
    { key: "ptcl", label: "PTCL", category: "internet" },
    { key: "nayatel", label: "Nayatel", category: "internet" },
    { key: "stormfiber", label: "StormFiber", category: "internet" },
    { key: "transworld", label: "Transworld", category: "internet" },

    // Mobile / PRI
    { key: "jazz", label: "Jazz", category: "mobile" },
    { key: "telenor", label: "Telenor", category: "mobile" },
    { key: "zong", label: "Zong", category: "mobile" },
    { key: "ufone", label: "Ufone", category: "mobile" },

    // Lift AMC
    { key: "kone", label: "KONE", category: "lift_amc" },
    { key: "schindler", label: "Schindler", category: "lift_amc" },
    { key: "otis", label: "OTIS", category: "lift_amc" },
    { key: "express_lift", label: "Express Lift", category: "lift_amc" },

    // Security / Guards AMC
    { key: "askari_guards", label: "Askari Guards", category: "security_amc" },
    { key: "phoenix_security", label: "Phoenix Security", category: "security_amc" },
    { key: "g4s", label: "G4S", category: "security_amc" },
  ],
};

/**
 * Return the provider preset list for a city, plus the universal
 * "Other (custom)" fallback at the bottom. Unknown / empty city → just
 * the fallback (the UI then nudges admin to set city in Settings).
 */
export function getProvidersForCity(city: string | null | undefined): Provider[] {
  if (!city) return [...COMMON_FALLBACK];
  const key = city.trim().toLowerCase();
  const presets = PROVIDERS_BY_CITY[key] ?? [];
  return [...presets, ...COMMON_FALLBACK];
}

/**
 * Friendly label for a stored provider key. For 'other', falls back to
 * the custom label admin typed at create time; if missing, returns the
 * raw key so reports never render blank.
 */
export function providerLabelFor(
  key: string,
  customLabel?: string | null,
): string {
  if (key === "other") {
    return customLabel?.trim() || "Other";
  }
  for (const list of Object.values(PROVIDERS_BY_CITY)) {
    const hit = list.find((p) => p.key === key);
    if (hit) return hit.label;
  }
  return key;
}

/**
 * Category for a stored provider key. Used to group cards on the
 * Bill Accounts page. Unknown keys map to 'other'.
 */
export function providerCategoryFor(key: string): ProviderCategory {
  if (key === "other") return "other";
  for (const list of Object.values(PROVIDERS_BY_CITY)) {
    const hit = list.find((p) => p.key === key);
    if (hit) return hit.category;
  }
  return "other";
}

/** Stable display order for category groups. */
export const CATEGORY_ORDER: ProviderCategory[] = [
  "electricity",
  "gas",
  "water",
  "internet",
  "mobile",
  "lift_amc",
  "security_amc",
  "other",
];

// ─── Units consumed ───────────────────────────────────────────────────
//
// PK utility bills (KE, SSGC, water board) print a "units" figure each
// month — residents and committees only ever say "300 units" / "500
// units", never kWh/HM³/m³. Keep one label across all surfaces.
export const UNITS_LABEL = "units";

// ─── Provider category → expense category + subcategory ──────────────
//
// When admin picks a bill account, we already know what kind of bill it
// is. Auto-fill the expense category + subcategory so the form doesn't
// ask the admin to pick "Utilities → Corridor Electricity" manually.
export const PROVIDER_CATEGORY_TO_EXPENSE: Record<
  ProviderCategory,
  { category: "utilities" | "repairs" | "supplies" | "other"; subcategory: string }
> = {
  electricity:  { category: "utilities", subcategory: "corridor_electricity" },
  gas:          { category: "utilities", subcategory: "gas" },
  water:        { category: "utilities", subcategory: "water_supply" },
  internet:     { category: "utilities", subcategory: "internet" },
  mobile:       { category: "utilities", subcategory: "internet" },
  lift_amc:     { category: "utilities", subcategory: "lift_service" },
  security_amc: { category: "other",     subcategory: "" },
  other:        { category: "other",     subcategory: "" },
};

export function expenseCategoryForProvider(providerKey: string): {
  category: "utilities" | "repairs" | "supplies" | "other";
  subcategory: string;
} {
  const cat = providerCategoryFor(providerKey);
  return PROVIDER_CATEGORY_TO_EXPENSE[cat];
}
