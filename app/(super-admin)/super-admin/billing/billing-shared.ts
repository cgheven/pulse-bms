/**
 * Shared types + tiny presentation helpers for the super-admin platform-billing
 * screen. Kept in its own module so `billing-client.tsx` and
 * `building-billing-dialog.tsx` can both import them without a cycle.
 *
 * NO pricing maths lives here — every figure comes from lib/client-pricing.ts.
 */
import type { ClientBilling, PlatformInvoice, PlatformInvoiceStatus } from "@/types";

export type BillingBuildingRow = {
  id: string;
  name: string;
  city: string | null;
  /**
   * LIVE registered-flat count (rows in bms_flats). This is the same figure
   * `generateInvoice()` snapshots — deliberately NOT bms_buildings.total_flats,
   * which is a manually-entered "planned" number.
   */
  live_flats: number;
  /** Contracted flat cap — the pricing basis when no flats are imported yet. */
  flat_limit: number;
  is_active: boolean;
  is_trial: boolean;
  /**
   * bms_buildings.pulse_monthly_charge — SUPERSEDED by
   * bms_client_billing.monthly_rate. Shown read-only as a migration hint when
   * a building has a legacy charge but no billing config yet. Never written.
   */
  legacy_monthly_charge: number | null;
  billing: ClientBilling | null;
  invoices: PlatformInvoice[];
  /**
   * The building's own admin (from bms_profiles), used to pre-fill BILLED TO
   * so the details are not retyped. Saved billing contact fields always win —
   * this is only the default for a building with no billing config yet.
   */
  admin_contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
    role: string;
  } | null;
};

/**
 * Which flat count we price on.
 *
 * The live count wins once the building has imported its flats — that is what
 * the generator snapshots, so the preview must agree with it. Before any flats
 * exist we fall back to the contracted `flat_limit` purely so a freshly-created
 * building still quotes a sensible tier instead of Rs. 0
 * (standardMonthlyRate(0) is 0 by design — see lib/client-pricing.ts). The UI
 * labels which basis was used, because on that path the generated invoice will
 * price at 0 until flats are imported.
 */
export function pricingFlats(row: {
  live_flats: number;
  flat_limit: number;
}): { flats: number; basis: "live" | "limit" } {
  if (row.live_flats > 0) return { flats: row.live_flats, basis: "live" };
  return { flats: row.flat_limit, basis: "limit" };
}

export function invoiceStatusPill(status: PlatformInvoiceStatus, overdue: boolean): string {
  if (status === "paid") return "status-paid";
  if (status === "cancelled") return "status-waived";
  return overdue ? "status-overdue" : "status-pending";
}

export function isOverdue(inv: PlatformInvoice, now = new Date()): boolean {
  if (inv.status !== "unpaid") return false;
  const due = Date.parse(inv.due_date);
  if (Number.isNaN(due)) return false;
  // Compare against local midnight without mutating the caller's Date.
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return due < startOfToday;
}

/** Latest invoice by period start (rows arrive newest-first from the server). */
export function latestInvoice(row: BillingBuildingRow): PlatformInvoice | null {
  return row.invoices.length > 0 ? row.invoices[0] : null;
}

export function outstandingTotal(invoices: PlatformInvoice[]): number {
  return invoices.reduce(
    (sum, i) => (i.status === "unpaid" ? sum + Number(i.amount) : sum),
    0,
  );
}

/** `YYYY-MM-DD` for a date input, in local terms. */
export function todayInputValue(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
