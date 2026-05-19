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

export type VehicleType = "car" | "bike" | "ev" | "other";

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  car:   "Car",
  bike:  "Bike",
  ev:    "Electric Vehicle",
  other: "Other",
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
