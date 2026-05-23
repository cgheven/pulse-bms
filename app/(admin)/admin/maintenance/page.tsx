import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GenerateInvoicesButton } from "@/components/admin/billing/generate-invoices-button";
import { InvoicesList, type InvoiceRow } from "@/components/admin/billing/invoices-list";
import { PaymentsList, type PaymentRow } from "@/components/admin/payments/payments-list";
import { RecordPaymentButton } from "@/components/admin/payments/record-payment-button";
import {
  DuesDefaultersPanel,
  type DefaulterRow,
} from "@/components/admin/payments/dues-defaulters-panel";
import {
  MaintenanceTabPanels,
  type MaintenanceTab,
} from "@/components/admin/maintenance/maintenance-tab-panels";
import { formatCurrency } from "@/lib/utils";
import { normalizePhone } from "@/lib/phone";
import { TableSkeleton, KpiRowSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

/**
 * /admin/maintenance — single home for maintenance billing.
 *
 * Replaces the old `/admin/billing` and `/admin/payments` pages with a
 * three-tab layout: Dues (default) · Payments · Invoices. The tab is
 * driven by `?tab=...` in the URL so deep links and back-button work
 * naturally. Header buttons (Generate Invoices + Record Payment) are
 * always visible regardless of the active tab — both flows are common
 * regardless of which list you're looking at.
 *
 * KPI strip pulls a small set of cross-cutting numbers so admins don't
 * have to flip tabs to see "how am I doing this month".
 */
export default function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const ym = today.slice(0, 7);
  const defaultMonth = ym;

  return (
    <div className="space-y-6 animate-fade-up">
      <Suspense
        fallback={
          <HeaderShell>
            <div className="h-11 w-44 rounded-md bg-secondary/40 animate-pulse" />
          </HeaderShell>
        }
      >
        <MaintenanceHeader defaultMonth={defaultMonth} />
      </Suspense>

      <Suspense fallback={<KpiRowSkeleton count={4} />}>
        <MaintenanceKpis />
      </Suspense>

      <TabsAndContent searchParams={searchParams} />
    </div>
  );
}

function HeaderShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1>Maintenance</h1>
        <p className="text-muted-foreground">
          Bills, payments, and defaulters in one place.
        </p>
      </div>
      <div className="shrink-0 flex flex-col sm:flex-row gap-2">{children}</div>
    </div>
  );
}

// --- Header (Generate Invoices + Record Payment) ----------------------------

async function MaintenanceHeader({ defaultMonth }: { defaultMonth: string }) {
  const header = await loadHeaderData();
  return (
    <HeaderShell>
      <GenerateInvoicesButton defaultMonth={defaultMonth} />
      {header?.flats ? (
        <RecordPaymentButton
          flats={header.flats}
          buildingName={header.buildingName}
          buildingId={header.buildingId}
        />
      ) : null}
    </HeaderShell>
  );
}

// Postgres-side approach would be cleaner, but we chunk `.in()` IDs into
// batches of 500 here to avoid a new RPC migration. Same fix applied at all
// three sites that join payments-by-invoice (KPI defaulters, Dues panel,
// Invoices tab). 500 keeps the encoded query well under PostgREST's URL
// length limit while only adding a second round-trip past ~500 invoices.
const IN_CHUNK_SIZE = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length <= size) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sumPaymentsByInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  invoiceIds: string[],
): Promise<Map<string, number>> {
  const paidByInv = new Map<string, number>();
  if (invoiceIds.length === 0) return paidByInv;
  for (const ids of chunk(invoiceIds, IN_CHUNK_SIZE)) {
    const { data: pays } = await supabase
      .from("bms_payments")
      .select("invoice_id, amount")
      .eq("building_id", buildingId)
      .in("invoice_id", ids);
    for (const p of pays ?? []) {
      if (!p.invoice_id) continue;
      paidByInv.set(
        p.invoice_id,
        (paidByInv.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0),
      );
    }
  }
  return paidByInv;
}

// --- KPI strip --------------------------------------------------------------

/**
 * The four KPI cards. We compute them with the minimum number of queries:
 *   - "This month total" + "Collected" come from current-month invoices +
 *     their payments. "Collected" is the sum of payments dated within the
 *     current month (regardless of which month's invoice they were against)
 *     — this matches the existing payments page semantic and is the more
 *     useful "cash this month" figure for the admin.
 *   - "Defaulters" is the count of distinct invoices across history where
 *     `amount_due > 0` (status != paid/waived AND remaining balance > 0).
 *   - "Credit balances" is the sum of unapplied `bms_flat_credits.amount`.
 */
async function MaintenanceKpis() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) return null;
  const supabase = await createClient();

  const today = new Date();
  const ym = today.toISOString().slice(0, 7);

  const [
    { data: monthInvoices },
    { data: monthPayments },
    { data: openInvoices },
    { data: credits },
  ] = await Promise.all([
    // Current-month invoices (not waived).
    supabase
      .from("bms_invoices")
      .select("id, amount, status")
      .eq("building_id", profile.building_id)
      .neq("status", "waived")
      .gte("billing_month", `${ym}-01`)
      .lt("billing_month", nextMonthFirstDay(ym)),
    // Payments dated within current month.
    supabase
      .from("bms_payments")
      .select("amount")
      .eq("building_id", profile.building_id)
      .gte("payment_date", `${ym}-01`)
      .lt("payment_date", nextMonthFirstDay(ym)),
    // Open invoices (any month) — used to count defaulters.
    supabase
      .from("bms_invoices")
      .select("id, amount")
      .eq("building_id", profile.building_id)
      .neq("status", "paid")
      .neq("status", "waived"),
    // Unapplied advance credit (society holds this money on behalf of flats).
    supabase
      .from("bms_flat_credits")
      .select("amount")
      .eq("building_id", profile.building_id)
      .is("applied_invoice_id", null),
  ]);

  const monthTotal = (monthInvoices ?? []).reduce(
    (s, r) => s + Number(r.amount ?? 0),
    0,
  );
  const collected = (monthPayments ?? []).reduce(
    (s, r) => s + Number(r.amount ?? 0),
    0,
  );

  // Defaulters: count of open invoices where remaining > 0 after applying
  // any payments. Payments are summed via chunked `.in()` lookup so we don't
  // silently truncate at >500 open invoices (PostgREST URL limit).
  const openIds = (openInvoices ?? []).map((i) => i.id);
  let defaulterCount = 0;
  if (openIds.length) {
    const paidByInv = await sumPaymentsByInvoice(
      supabase,
      profile.building_id,
      openIds,
    );
    defaulterCount = (openInvoices ?? []).filter((inv) => {
      const due = Number(inv.amount ?? 0) - (paidByInv.get(inv.id) ?? 0);
      return due > 0;
    }).length;
  }

  const creditTotal = (credits ?? []).reduce(
    (s, r) => s + Number(r.amount ?? 0),
    0,
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Kpi label="This month total" value={formatCurrency(monthTotal)} />
      <Kpi
        label="Collected (this month)"
        value={formatCurrency(collected)}
        accent="success"
      />
      <Kpi
        label="Defaulters"
        value={String(defaulterCount)}
        accent={defaulterCount > 0 ? "destructive" : undefined}
      />
      <Kpi
        label="Credit balances"
        value={formatCurrency(creditTotal)}
        accent={creditTotal > 0 ? "success" : undefined}
      />
    </div>
  );
}

function nextMonthFirstDay(ym: string): string {
  // ym is "YYYY-MM". Return the first day of the *next* month as YYYY-MM-DD.
  const [y, m] = ym.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return `${nextY.toString().padStart(4, "0")}-${nextM
    .toString()
    .padStart(2, "0")}-01`;
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "warning" | "destructive";
}) {
  const accentCls =
    accent === "success"
      ? "text-[hsl(151_70%_28%)]"
      : accent === "warning"
      ? "text-[hsl(38_95%_35%)]"
      : accent === "destructive"
      ? "text-destructive"
      : "";
  return (
    <div className="card-soft">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accentCls}`}>{value}</div>
    </div>
  );
}

// --- Tab switcher + content -------------------------------------------------

async function TabsAndContent({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = normalizeTab(sp.tab);

  // Render all three tab bodies on initial load — Suspense streams them in
  // parallel. The client `MaintenanceTabPanels` toggles visibility via CSS so
  // subsequent tab clicks are instant (no round-trip, no refetch).
  return (
    <MaintenanceTabPanels
      initialTab={tab}
      dues={
        <Suspense fallback={<TableSkeleton rows={6} />}>
          <DuesTab />
        </Suspense>
      }
      payments={
        <Suspense fallback={<TableSkeleton rows={6} />}>
          <PaymentsTab />
        </Suspense>
      }
      invoices={
        <Suspense fallback={<TableSkeleton rows={6} />}>
          <InvoicesTab />
        </Suspense>
      }
    />
  );
}

function normalizeTab(raw: string | undefined): MaintenanceTab {
  if (raw === "payments" || raw === "invoices") return raw;
  return "dues";
}

// --- Tab 1: Dues ------------------------------------------------------------

async function DuesTab() {
  const data = await loadDefaultersData();
  if (data.noBuilding) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  return (
    <DuesDefaultersPanel defaulters={data.rows} buildingName={data.buildingName} />
  );
}

async function loadDefaultersData() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) return { noBuilding: true as const };
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("bms_invoices")
    .select("id, invoice_number, flat_id, billing_month, amount, due_date, status")
    .eq("building_id", profile.building_id)
    .neq("status", "paid")
    .neq("status", "waived")
    .order("billing_month", { ascending: true });

  const invRows = invoices ?? [];
  if (invRows.length === 0) {
    return { noBuilding: false as const, rows: [] as DefaulterRow[], buildingName: "" };
  }

  const invIds = invRows.map((i) => i.id);
  const flatIds = Array.from(new Set(invRows.map((i) => i.flat_id)));

  // Payments lookup chunked (see sumPaymentsByInvoice); other lookups
  // parallelized as before.
  const [paidByInvoice, { data: flats }, { data: primaries }, { data: building }] =
    await Promise.all([
      sumPaymentsByInvoice(supabase, profile.building_id, invIds),
      supabase
        .from("bms_flats")
        .select("id, flat_number")
        .eq("building_id", profile.building_id)
        .in("id", flatIds),
      supabase
        .from("bms_residents")
        .select("flat_id, full_name, phone")
        .eq("building_id", profile.building_id)
        .eq("is_active", true)
        .eq("is_primary", true)
        .in("flat_id", flatIds),
      supabase
        .from("bms_buildings")
        .select("name")
        .eq("id", profile.building_id)
        .single(),
    ]);

  const flatMap = new Map((flats ?? []).map((f) => [f.id, f.flat_number]));
  const primaryByFlat = new Map(
    (primaries ?? []).map((r) => [r.flat_id, { name: r.full_name, phone: r.phone }]),
  );

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const rows: DefaulterRow[] = invRows
    .map((inv) => {
      const total = Number(inv.amount);
      const paid = paidByInvoice.get(inv.id) ?? 0;
      const due = total - paid;
      const primary = primaryByFlat.get(inv.flat_id);
      const daysLate =
        inv.due_date && inv.due_date < todayStr
          ? Math.floor(
              (new Date(todayStr).getTime() - new Date(inv.due_date).getTime()) /
                86_400_000,
            )
          : 0;
      return {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        flat_id: inv.flat_id,
        flat_number: flatMap.get(inv.flat_id) ?? "—",
        resident_name: primary?.name ?? null,
        resident_phone: normalizePhone(primary?.phone ?? null),
        billing_month: inv.billing_month,
        due_date: inv.due_date,
        amount_total: total,
        amount_paid: paid,
        amount_due: due,
        days_late: daysLate,
      };
    })
    .filter((r) => r.amount_due > 0)
    .sort((a, b) => {
      if (b.days_late !== a.days_late) return b.days_late - a.days_late;
      return b.amount_due - a.amount_due;
    });

  return {
    noBuilding: false as const,
    rows,
    buildingName: building?.name ?? "Building",
  };
}

// --- Tab 2: Payments --------------------------------------------------------

async function PaymentsTab() {
  const data = await loadPaymentsData();
  if (data.noBuilding) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <PaymentsList payments={data.rows} />
      {/* Discoverability: maintenance-only filter is a recent split — many
          admins will still hunt for entry fees / fines here. Small link, not a
          prominent button, so it doesn't compete with the table. */}
      <p className="text-sm text-muted-foreground">
        Looking for entry fees / fines? →{" "}
        <Link
          href="/admin/other-income"
          className="text-primary hover:underline"
        >
          Other Income
        </Link>
      </p>
    </div>
  );
}

async function loadPaymentsData() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return { noBuilding: true as const };
  }
  const supabase = await createClient();

  const [{ data: payments }, { data: flats }, { data: building }] = await Promise.all([
    // Maintenance page = maintenance payments only. Entry fees / fines /
    // "other" live on /admin/other-income so this tab stays focused on the
    // monthly maintenance flow.
    supabase
      .from("bms_payments")
      .select(
        "id, payment_date, flat_id, resident_id, amount, payment_mode, category, receipt_no, legacy_receipt_no, recorded_by, invoice_id, reference_no, received_by_name, received_by_position",
      )
      .eq("building_id", profile.building_id)
      .eq("category", "maintenance")
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("bms_flats")
      .select("id, flat_number, outstanding_dues")
      .eq("building_id", profile.building_id)
      .order("flat_number"),
    supabase
      .from("bms_buildings")
      .select("name")
      .eq("id", profile.building_id)
      .single(),
  ]);

  const residentIds = Array.from(
    new Set((payments ?? []).map((p) => p.resident_id).filter(Boolean) as string[]),
  );
  const invoiceIds = Array.from(
    new Set((payments ?? []).map((p) => p.invoice_id).filter(Boolean) as string[]),
  );
  const recorderIds = Array.from(
    new Set((payments ?? []).map((p) => p.recorded_by).filter(Boolean) as string[]),
  );

  const [{ data: residents }, { data: invoices }, { data: recorders }] = await Promise.all([
    residentIds.length
      ? supabase.from("bms_residents").select("id, full_name").in("id", residentIds)
      : Promise.resolve({ data: [] }),
    invoiceIds.length
      ? supabase
          .from("bms_invoices")
          .select("id, invoice_number, billing_month")
          .in("id", invoiceIds)
      : Promise.resolve({ data: [] }),
    recorderIds.length
      ? supabase.from("bms_profiles").select("id, full_name, email").in("id", recorderIds)
      : Promise.resolve({ data: [] }),
  ]);

  const flatMap = new Map((flats ?? []).map((f) => [f.id, f.flat_number]));
  const resMap = new Map((residents ?? []).map((r) => [r.id, r.full_name]));
  const invMap = new Map(
    (invoices ?? []).map((i) => [i.id, { number: i.invoice_number, month: i.billing_month }]),
  );
  const recMap = new Map(
    (recorders ?? []).map((p) => [p.id, p.full_name ?? p.email ?? ""]),
  );

  const rows: PaymentRow[] = (payments ?? []).map((p) => ({
    id: p.id,
    payment_date: p.payment_date,
    flat_id: p.flat_id ?? "",
    flat_number: p.flat_id ? flatMap.get(p.flat_id) ?? "—" : "—",
    resident_name: p.resident_id ? resMap.get(p.resident_id) ?? null : null,
    amount: Number(p.amount),
    payment_mode: p.payment_mode,
    category: p.category,
    receipt_no: p.receipt_no,
    legacy_receipt_no: (p as { legacy_receipt_no?: string | null }).legacy_receipt_no ?? null,
    recorded_by_name: p.recorded_by ? recMap.get(p.recorded_by) ?? null : null,
    reference_no: p.reference_no,
    invoice_id: p.invoice_id ?? null,
    invoice_number: p.invoice_id ? invMap.get(p.invoice_id)?.number ?? null : null,
    billing_month: p.invoice_id ? invMap.get(p.invoice_id)?.month ?? null : null,
    received_by_name: p.received_by_name ?? null,
    received_by_position: p.received_by_position ?? null,
  }));

  return {
    noBuilding: false as const,
    rows,
    buildingName: building?.name ?? "Building",
    buildingId: profile.building_id,
  };
}

// --- Tab 3: Invoices --------------------------------------------------------

async function InvoicesTab() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  const supabase = await createClient();

  const [{ data: invoices }, { data: flats }, { data: building }] = await Promise.all([
    supabase
      .from("bms_invoices")
      .select("id, invoice_number, flat_id, billing_month, amount, status, due_date")
      .eq("building_id", profile.building_id)
      .order("billing_month", { ascending: false })
      .order("invoice_number", { ascending: false })
      .limit(500),
    supabase
      .from("bms_flats")
      .select("id, flat_number, outstanding_dues")
      .eq("building_id", profile.building_id)
      .order("flat_number"),
    supabase
      .from("bms_buildings")
      .select("name")
      .eq("id", profile.building_id)
      .single(),
  ]);

  const invIds = (invoices ?? []).map((i) => i.id);
  // Chunked + building_id-scoped for defence-in-depth (same pattern as KPI
  // defaulters and Dues panel).
  const paidMap = await sumPaymentsByInvoice(
    supabase,
    profile.building_id,
    invIds,
  );

  const flatMap = new Map((flats ?? []).map((f) => [f.id, f.flat_number]));

  const { data: primaries } = await supabase
    .from("bms_residents")
    .select("flat_id, full_name")
    .eq("building_id", profile.building_id)
    .eq("is_active", true)
    .eq("is_primary", true);
  const primaryByFlat = new Map((primaries ?? []).map((r) => [r.flat_id, r.full_name]));

  const rows: InvoiceRow[] = (invoices ?? []).map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    flat_id: inv.flat_id,
    flat_number: flatMap.get(inv.flat_id) ?? "—",
    resident_name: primaryByFlat.get(inv.flat_id) ?? null,
    billing_month: inv.billing_month,
    amount: Number(inv.amount),
    status: inv.status ?? "pending",
    due_date: inv.due_date,
    paid_total: paidMap.get(inv.id) ?? 0,
  }));

  return (
    <InvoicesList
      invoices={rows}
      buildingName={building?.name ?? "Building"}
      buildingId={profile.building_id}
      flatPickerOptions={(flats ?? []).map((f) => ({
        id: f.id,
        flat_number: f.flat_number,
        outstanding_dues: Number(f.outstanding_dues ?? 0),
      }))}
    />
  );
}

// --- Shared helper for the header -------------------------------------------

/**
 * Single fetch for header data — flat picker options + building name.
 * One `requireRole` call + one round-trip (two parallel queries) instead of
 * two separate helpers each doing their own auth check.
 */
async function loadHeaderData() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) return null;
  const supabase = await createClient();
  const [{ data: flats }, { data: building }] = await Promise.all([
    supabase
      .from("bms_flats")
      .select("id, flat_number, outstanding_dues")
      .eq("building_id", profile.building_id)
      .order("flat_number"),
    supabase
      .from("bms_buildings")
      .select("name")
      .eq("id", profile.building_id)
      .single(),
  ]);
  return {
    flats: (flats ?? []).map((f) => ({
      id: f.id,
      flat_number: f.flat_number,
      outstanding_dues: Number(f.outstanding_dues ?? 0),
    })),
    buildingName: building?.name ?? "Building",
    buildingId: profile.building_id,
  };
}
