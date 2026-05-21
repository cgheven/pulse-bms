// Pulse BMS — shared types

export type Role = "super_admin" | "admin" | "union" | "resident";

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin:       "Admin",
  union:       "Union",
  resident:    "Resident",
};

export const ROLE_HOME: Record<Role, string> = {
  super_admin: "/super-admin",
  admin:       "/admin",
  union:       "/union",
  resident:    "/resident",
};

export type Building = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  total_flats: number;
  fund_balance: number;
  entry_fee_owner: number;
  entry_fee_tenant: number;
  monthly_fee_default: number;
  utility_cutoff_after_months: number;
  voting_rule: "majority" | "unanimous";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: Role;
  building_id: string | null;
  is_active: boolean;
  /**
   * True if this profile is a read-only sales-demo account. Set by the
   * seed-demo-users script and enforced by `requireNotDemo()` plus
   * restrictive RLS policies (`bms_<table>_demo_deny_*`).
   */
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type Flat = {
  id: string;
  building_id: string;
  flat_number: string;
  floor: number | null;
  block: string | null;
  size_sqft: number | null;
  monthly_fee: number | null;
  ownership_type: "owner" | "tenant" | "vacant";
  outstanding_dues: number;
  notes: string | null;
};

export type Resident = {
  id: string;
  building_id: string;
  flat_id: string;
  profile_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  cnic: string | null;
  relationship: "owner" | "tenant" | "family";
  is_primary: boolean;
  move_in_date: string | null;
  move_out_date: string | null;
  entry_fee_paid: number;
  is_active: boolean;
};

export type StaffRole = "chowkidar" | "sweeper" | "lift_man" | "generator_tech" | "plumber" | "electrician" | "other";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  chowkidar:      "Chowkidar (Guard)",
  sweeper:        "Sweeper",
  lift_man:       "Lift Operator",
  generator_tech: "Generator Technician",
  plumber:        "Plumber",
  electrician:    "Electrician",
  other:          "Other",
};

export type ProposalStatus = "pending" | "approved" | "rejected" | "executed" | "cancelled";
export type InvoiceStatus  = "pending" | "paid" | "partial" | "overdue" | "waived";

/**
 * Canonical payment mode values. The DB enum is
 * `cash | bank | online | cheque | credit_carryforward`. We keep the
 * carry-forward literal here so it isn't a free-floating magic string
 * scattered across actions and PDF builders.
 *
 * `BANK_TRANSFER` is the *form* value (UI label) — the server action maps
 * it to the DB enum `bank` before insert. Both are exported so the
 * mapping has a single source of truth.
 */
export const PAYMENT_MODE = {
  CASH: "cash",
  BANK_TRANSFER: "bank_transfer",
  BANK: "bank",
  CHEQUE: "cheque",
  ONLINE: "online",
  OTHER: "other",
  CREDIT_CARRYFORWARD: "credit_carryforward",
} as const;
export type PaymentMode = typeof PAYMENT_MODE[keyof typeof PAYMENT_MODE];

/**
 * A parked overpayment waiting to be auto-applied to the next invoice for
 * the same flat. `applied_invoice_id` is null while the credit is open;
 * once consumed it points at the invoice that absorbed it. Split credits
 * preserve `created_at` on the remainder row so FIFO ordering is stable.
 */
export type FlatCredit = {
  id: string;
  building_id: string;
  flat_id: string;
  amount: number;
  source_payment_id: string | null;
  applied_invoice_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type VehicleType = "car" | "bike" | "ev" | "other";

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  car:   "Car",
  bike:  "Bike",
  ev:    "Electric Vehicle",
  other: "Other",
};

/**
 * A bank account (or cash drawer) used to receive payments and pay
 * expenses. Every building has at least one row (the auto-seeded "Cash"
 * account). Used by the Reports module to compute per-account opening /
 * closing balances and to filter Cash Position by bank.
 */
export type BankAccount = {
  id: string;
  building_id: string;
  name: string;
  type: "cash" | "bank";
  account_number_masked: string | null;
  opening_balance: number;
  opening_balance_date: string;
  is_active: boolean;
  created_at: string;
};

export interface Vehicle {
  id: string;
  building_id: string;
  flat_id: string;
  resident_id: string | null;
  plate_number: string;
  vehicle_type: VehicleType;
  make: string | null;
  model: string | null;
  color: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
