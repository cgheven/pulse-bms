import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClientBilling, PlatformInvoice } from "@/types";
import { BillingClient } from "./billing-client";
import type { BillingBuildingRow } from "./billing-shared";

export const dynamic = "force-dynamic";

/**
 * Pulse platform billing — PulseHub invoicing its own client buildings.
 *
 * super_admin ONLY. The `sales` role can reach /super-admin/trials and must
 * never see or edit platform invoices, so this route deliberately does NOT
 * include "sales" in requireRole (unlike the trials page).
 */

// PostgREST max_rows is 1000 in this project, so an unbounded .select()
// truncates silently. Page through with .range() — same discipline as
// lib/finance-totals.ts. Never use PostgREST aggregate syntax here.
const PAGE_SIZE = 1000;

type AdminDb = ReturnType<typeof createAdminClient>;

async function fetchAllRows<T>(
  db: AdminDb,
  table: string,
  orderColumn: string,
): Promise<{ rows: T[]; error: string | null }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order(orderColumn, { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { rows: out, error: error.message };
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return { rows: out, error: null };
}

type ProfileRecord = {
  building_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  created_at: string;
};

type AdminContact = {
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
};

type BuildingRecord = {
  id: string;
  name: string;
  city: string | null;
  flat_limit: number | null;
  is_active: boolean;
  is_trial: boolean;
  pulse_monthly_charge: number | null;
  created_at: string;
};

/**
 * Live registered-flat count per building.
 *
 * MUST match what `generateInvoice()` snapshots, which counts rows in
 * bms_flats — NOT bms_buildings.total_flats, which is a manually-entered
 * "planned" figure. If these two disagree the preview lies about the price.
 *
 * `head: true` + `count: "exact"` so the 1000-row max_rows ceiling cannot
 * silently under-count (and therefore under-price) a Pro-tier building.
 * Never replace with a PostgREST aggregate — they are disabled here.
 */
async function countFlatsPerBuilding(
  db: AdminDb,
  ids: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const CONCURRENCY = 10;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const slice = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (id) => {
        const { count } = await db
          .from("bms_flats")
          .select("id", { count: "exact", head: true })
          .eq("building_id", id);
        return [id, count ?? 0] as const;
      }),
    );
    for (const [id, count] of results) counts.set(id, count);
  }
  return counts;
}

/**
 * The building's own admin, used to pre-fill BILLED TO so nobody retypes
 * contact details that already exist in bms_profiles. Earliest-created active
 * admin wins when a building has more than one. Falls back to `union` only if
 * there is no admin at all, since somebody must receive the invoice.
 *
 * Saved contact fields on bms_client_billing still take precedence — this is
 * only the default, because the billing contact is sometimes a treasurer who
 * is not the app admin.
 */
async function fetchAdminContacts(
  db: AdminDb,
  ids: string[],
): Promise<Map<string, AdminContact>> {
  const out = new Map<string, AdminContact>();
  if (ids.length === 0) return out;

  const { data } = await db
    .from("bms_profiles")
    .select("building_id, full_name, email, phone, role, created_at")
    .in("building_id", ids)
    .in("role", ["admin", "union"])
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .range(0, PAGE_SIZE - 1);

  for (const p of (data ?? []) as ProfileRecord[]) {
    if (!p.building_id) continue;
    const existing = out.get(p.building_id);
    // First admin wins; a union member only fills a slot no admin has taken.
    if (existing && !(existing.role === "union" && p.role === "admin")) continue;
    out.set(p.building_id, {
      name: p.full_name ?? null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      role: p.role,
    });
  }
  return out;
}

export default async function PlatformBillingPage() {
  await requireRole("super_admin");

  const db = createAdminClient();

  const [buildingsRes, billingRes, invoicesRes] = await Promise.all([
    db
      .from("bms_buildings")
      .select(
        "id, name, city, flat_limit, is_active, is_trial, pulse_monthly_charge, created_at",
      )
      .order("name", { ascending: true })
      .range(0, PAGE_SIZE - 1),
    fetchAllRows<ClientBilling>(db, "bms_client_billing", "updated_at"),
    fetchAllRows<PlatformInvoice>(db, "bms_platform_invoices", "billing_period_start"),
  ]);

  const buildings = (buildingsRes.data ?? []) as BuildingRecord[];
  const buildingIds = buildings.map((b) => b.id);
  const [flatCounts, adminContacts] = await Promise.all([
    countFlatsPerBuilding(db, buildingIds),
    fetchAdminContacts(db, buildingIds),
  ]);

  // The billing tables ship in migration 20260802000003 and are applied by a
  // human. Until then, surface a precise reason instead of an empty screen.
  const setupError = billingRes.error ?? invoicesRes.error;

  const billingByBuilding = new Map<string, ClientBilling>();
  for (const row of billingRes.rows) billingByBuilding.set(row.building_id, row);

  const invoicesByBuilding = new Map<string, PlatformInvoice[]>();
  for (const inv of invoicesRes.rows) {
    const list = invoicesByBuilding.get(inv.building_id);
    if (list) list.push(inv);
    else invoicesByBuilding.set(inv.building_id, [inv]);
  }

  const rows: BillingBuildingRow[] = buildings.map((b) => ({
    id: b.id,
    name: b.name,
    city: b.city,
    live_flats: flatCounts.get(b.id) ?? 0,
    flat_limit: Number(b.flat_limit ?? 0),
    is_active: b.is_active,
    is_trial: b.is_trial,
    legacy_monthly_charge:
      b.pulse_monthly_charge === null ? null : Number(b.pulse_monthly_charge),
    billing: billingByBuilding.get(b.id) ?? null,
    invoices: invoicesByBuilding.get(b.id) ?? [],
    admin_contact: adminContacts.get(b.id) ?? null,
  }));

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1>Platform Billing</h1>
          <p className="text-muted-foreground mt-1">
            What Pulse charges each client building for its BMS subscription.
          </p>
        </div>
      </div>

      {setupError && (
        <div className="card-soft border-destructive/40 bg-destructive/5 text-destructive text-sm">
          <p className="font-semibold">Billing tables are not available yet.</p>
          <p className="mt-1 opacity-90">
            Apply migration{" "}
            <code className="font-mono">20260802000003_bms_client_billing.sql</code>{" "}
            to create <code className="font-mono">bms_client_billing</code> and{" "}
            <code className="font-mono">bms_platform_invoices</code>.
          </p>
          <p className="mt-1 opacity-70 text-xs">{setupError}</p>
        </div>
      )}

      <BillingClient rows={rows} />
    </div>
  );
}
