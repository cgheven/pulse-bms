import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { GenerateInvoicesButton } from "@/components/admin/billing/generate-invoices-button";
import {
  DuesDefaultersPanel,
  type DefaulterRow,
} from "@/components/admin/payments/dues-defaulters-panel";
import { Receipt, Wallet, Users, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { normalizePhone } from "@/lib/phone";
import { StatCard } from "@/components/ui/stat-card";
import { TableSkeleton, KpiRowSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

/**
 * /admin/maintenance — the single home for maintenance billing.
 *
 * One screen, no tabs: a KPI strip plus the monthly flat list (who's Paid /
 * Unpaid / Partial for the selected month, with Record / Remind / Receipt per
 * row). The full payment transaction ledger lives behind the list's
 * "All payments →" link (/admin/payments) for reconciliation and undo.
 */
export default function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ duesMonth?: string }>;
}) {
  return (
    <div className="space-y-4 animate-fade-up">
      <header>
        <h1>Maintenance</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Bills, payments, and defaulters in one place.
        </p>
      </header>

      <Suspense fallback={<KpiRowSkeleton count={4} />}>
        <MaintenanceKpis />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <DuesSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DuesSection({
  searchParams,
}: {
  searchParams: Promise<{ duesMonth?: string }>;
}) {
  const sp = await searchParams;
  return <DuesTab duesMonth={sp.duesMonth} />;
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

/**
 * The payment id to open a receipt for, per invoice. Prefers a payment that
 * actually carries a receipt number (the "anchor" of a collection), falling
 * back to any payment against the invoice. Lets the monthly list link a paid
 * or partially-paid flat straight to its receipt.
 */
async function anchorPaymentByInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  invoiceIds: string[],
): Promise<Map<string, string>> {
  const anchor = new Map<string, string>();
  const hasReceipt = new Set<string>();
  if (invoiceIds.length === 0) return anchor;
  for (const ids of chunk(invoiceIds, IN_CHUNK_SIZE)) {
    const { data: pays } = await supabase
      .from("bms_payments")
      .select("id, invoice_id, receipt_no, payment_date")
      .eq("building_id", buildingId)
      .in("invoice_id", ids)
      .order("payment_date", { ascending: false });
    for (const p of pays ?? []) {
      if (!p.invoice_id) continue;
      const withReceipt = p.receipt_no != null;
      // Keep the first receipt-bearing payment we see (newest, since ordered
      // desc); otherwise seed with any payment until a better one turns up.
      if (withReceipt && !hasReceipt.has(p.invoice_id)) {
        anchor.set(p.invoice_id, p.id);
        hasReceipt.add(p.invoice_id);
      } else if (!anchor.has(p.invoice_id)) {
        anchor.set(p.invoice_id, p.id);
      }
    }
  }
  return anchor;
}

// --- KPI strip --------------------------------------------------------------

/**
 * The four KPI cards. We compute them with the minimum number of queries:
 *   - "This month total" + "Collected" come from current-month invoices +
 *     their payments. "Collected" is the sum of payments dated within the
 *     current month (regardless of which month's invoice they were against)
 *     — this matches the existing payments page semantic and is the more
 *     useful "cash this month" figure for the admin.
 *   - "Defaulters" is the count of distinct FLATS with any unpaid balance
 *     (status != paid/waived AND remaining > 0). It counted invoices before,
 *     which read as ~133 defaulters in an 89-flat building because six months
 *     of arrears counted the same flat six times.
 *   - "Total outstanding" is the sum of those remaining balances. It replaced
 *     a "Credit balances" tile that was permanently Rs. 0 — flat credits only
 *     exist after an overpayment, and are surfaced on the flat detail page and
 *     the resident portal where they're actionable.
 */
async function MaintenanceKpis() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) return null;
  const supabase = await createClient();

  const today = new Date();
  const ym = today.toISOString().slice(0, 7);

  const [
    { data: monthInvoices },
    { data: monthPayments },
    { data: openInvoices },
  ] = await Promise.all([
    // Current-month invoices (not waived).
    supabase
      .from("bms_invoices")
      .select("id, amount, status")
      .eq("building_id", buildingId)
      .neq("status", "waived")
      .gte("billing_month", `${ym}-01`)
      .lt("billing_month", nextMonthFirstDay(ym)),
    // Payments dated within current month.
    supabase
      .from("bms_payments")
      .select("amount")
      .eq("building_id", buildingId)
      .gte("payment_date", `${ym}-01`)
      .lt("payment_date", nextMonthFirstDay(ym)),
    // Open invoices (any month) — used to count defaulters. flat_id is what
    // makes the count per-flat rather than per-invoice.
    supabase
      .from("bms_invoices")
      .select("id, amount, flat_id")
      .eq("building_id", buildingId)
      .neq("status", "paid")
      .neq("status", "waived"),
  ]);

  const monthTotal = (monthInvoices ?? []).reduce(
    (s, r) => s + Number(r.amount ?? 0),
    0,
  );
  const collected = (monthPayments ?? []).reduce(
    (s, r) => s + Number(r.amount ?? 0),
    0,
  );

  // Defaulters: distinct FLATS carrying any unpaid balance — NOT the number of
  // unpaid invoices. A flat six months in arrears is one defaulter, not six.
  // Payments are summed via chunked `.in()` lookup so we don't silently
  // truncate at >500 open invoices (PostgREST URL limit).
  const openIds = (openInvoices ?? []).map((i) => i.id);
  const defaulterFlats = new Set<string>();
  let outstandingTotal = 0;
  if (openIds.length) {
    const paidByInv = await sumPaymentsByInvoice(
      supabase,
      buildingId,
      openIds,
    );
    for (const inv of openInvoices ?? []) {
      const due = Number(inv.amount ?? 0) - (paidByInv.get(inv.id) ?? 0);
      if (due <= 0) continue;
      outstandingTotal += due;
      if (inv.flat_id) defaulterFlats.add(inv.flat_id);
    }
  }
  const defaulterCount = defaulterFlats.size;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard icon={Receipt} label="This month total" value={formatCurrency(monthTotal)} />
      <StatCard
        icon={Wallet}
        label="Collected (this month)"
        value={formatCurrency(collected)}
        tone="success"
      />
      <StatCard
        icon={Users}
        label="Defaulters (flats)"
        value={String(defaulterCount)}
        tone={defaulterCount > 0 ? "danger" : "default"}
      />
      <StatCard
        icon={AlertCircle}
        label="Total outstanding"
        value={formatCurrency(outstandingTotal)}
        tone={outstandingTotal > 0 ? "danger" : "default"}
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

// --- The monthly maintenance list -------------------------------------------

async function DuesTab({ duesMonth }: { duesMonth?: string }) {
  const data = await loadDefaultersData(duesMonth);
  if (data.noBuilding) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  return (
    <DuesDefaultersPanel
      defaulters={data.rows}
      buildingName={data.buildingName}
      buildingId={data.buildingId}
      flatPickerOptions={data.flatPickerOptions}
      month={data.month}
      availableMonths={data.availableMonths}
      generateSlot={<GenerateInvoicesButton defaultMonth={data.month} />}
    />
  );
}

const DUES_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

async function loadDefaultersData(duesMonth?: string) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) return { noBuilding: true as const };
  const supabase = await createClient();

  const currentYm = new Date().toISOString().slice(0, 7);
  // Scope to one month, so the query is bounded by the flat count no matter
  // how much history the building has (avoids PostgREST's 1000-row cap).
  const month = duesMonth && DUES_MONTH_RE.test(duesMonth) ? duesMonth : currentYm;
  const monthStart = `${month}-01`;
  const monthEnd = nextMonthFirstDay(month);

  // Building name + the earliest invoice month (for the month selector) load
  // regardless of whether the chosen month has invoices.
  const [{ data: building }, { data: earliestInv }, { data: invoices }] =
    await Promise.all([
      supabase.from("bms_buildings").select("name").eq("id", buildingId).single(),
      supabase
        .from("bms_invoices")
        .select("billing_month")
        .eq("building_id", buildingId)
        .neq("status", "waived")
        .order("billing_month", { ascending: true })
        .limit(1),
      supabase
        .from("bms_invoices")
        .select("id, invoice_number, flat_id, billing_month, amount, due_date, status")
        .eq("building_id", buildingId)
        .neq("status", "waived")
        .gte("billing_month", monthStart)
        .lt("billing_month", monthEnd)
        .order("flat_id", { ascending: true }),
    ]);

  const buildingName = building?.name ?? "Building";
  const earliestYm = earliestInv?.[0]?.billing_month?.slice(0, 7) ?? currentYm;
  const availableMonths = monthListDesc(earliestYm, currentYm, month);

  const invRows = invoices ?? [];
  if (invRows.length === 0) {
    return {
      noBuilding: false as const,
      rows: [] as DefaulterRow[],
      buildingName,
      buildingId,
      flatPickerOptions: [] as { id: string; flat_number: string; outstanding_dues: number }[],
      month,
      availableMonths,
    };
  }

  const invIds = invRows.map((i) => i.id);
  const flatIds = Array.from(new Set(invRows.map((i) => i.flat_id)));

  // Payments lookup chunked (see sumPaymentsByInvoice); other lookups
  // parallelized as before. Building name was already loaded above.
  const [paidByInvoice, anchorByInvoice, { data: flats }, { data: primaries }] =
    await Promise.all([
      sumPaymentsByInvoice(supabase, buildingId, invIds),
      anchorPaymentByInvoice(supabase, buildingId, invIds),
      supabase
        .from("bms_flats")
        .select("id, flat_number, outstanding_dues")
        .eq("building_id", buildingId)
        .in("id", flatIds),
      supabase
        .from("bms_residents")
        .select("id, flat_id, full_name, phone")
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .eq("is_primary", true)
        .in("flat_id", flatIds),
    ]);

  const flatMap = new Map((flats ?? []).map((f) => [f.id, f.flat_number]));
  const primaryByFlat = new Map(
    (primaries ?? []).map((r) => [r.flat_id, { id: r.id, name: r.full_name, phone: r.phone }]),
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
        resident_id: primary?.id ?? null,
        resident_name: primary?.name ?? null,
        resident_phone: normalizePhone(primary?.phone ?? null),
        billing_month: inv.billing_month,
        due_date: inv.due_date,
        amount_total: total,
        amount_paid: paid,
        amount_due: due,
        days_late: daysLate,
        receipt_payment_id: paid > 0 ? anchorByInvoice.get(inv.id) ?? null : null,
      };
    })
    // All statuses now — unpaid and partial first (actionable), paid last;
    // within a group, biggest balance first, then flat number.
    .sort((a, b) => {
      const ao = a.amount_due <= 0 ? 1 : 0;
      const bo = b.amount_due <= 0 ? 1 : 0;
      if (ao !== bo) return ao - bo;
      if (b.amount_due !== a.amount_due) return b.amount_due - a.amount_due;
      return a.flat_number.localeCompare(b.flat_number, undefined, { numeric: true });
    });

  return {
    noBuilding: false as const,
    rows,
    buildingName,
    buildingId,
    flatPickerOptions: (flats ?? []).map((f) => ({
      id: f.id,
      flat_number: f.flat_number,
      outstanding_dues: Number(f.outstanding_dues ?? 0),
    })),
    month,
    availableMonths,
  };
}

/** Month list from `earliest` to `current`, newest first, always including the
 *  currently-selected month. Capped so an odd imported date can't blow it up. */
function monthListDesc(earliestYm: string, currentYm: string, selected: string): string[] {
  const set = new Set<string>([currentYm, selected]);
  let cursor = earliestYm <= currentYm ? earliestYm : currentYm;
  for (let i = 0; i < 60 && cursor <= currentYm; i++) {
    set.add(cursor);
    cursor = nextMonthFirstDay(cursor).slice(0, 7);
  }
  return Array.from(set).sort().reverse();
}

