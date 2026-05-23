import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PaymentsList, type PaymentRow } from "@/components/admin/payments/payments-list";
import { RecordPaymentButton } from "@/components/admin/payments/record-payment-button";
import { formatCurrency } from "@/lib/utils";
import { TableSkeleton, KpiRowSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

/**
 * /admin/other-income — companion to /admin/maintenance.
 *
 * Surfaces non-maintenance payments (entry fees, fines, "other") so the
 * Maintenance page stays focused on the monthly billing loop. Mirrors the
 * maintenance page's structure (header + KPI strip + table + record button)
 * so the muscle memory carries over for admins.
 */
export default function OtherIncomePage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <Suspense
        fallback={
          <HeaderShell>
            <div className="h-11 w-52 rounded-md bg-secondary/40 animate-pulse" />
          </HeaderShell>
        }
      >
        <OtherIncomeHeader />
      </Suspense>

      <Suspense fallback={<KpiRowSkeleton count={4} />}>
        <OtherIncomeKpis />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <OtherIncomeTable />
      </Suspense>
    </div>
  );
}

function HeaderShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1>Other Income</h1>
        <p className="text-muted-foreground">
          Entry fees, fines, and other one-off payments.
        </p>
      </div>
      <div className="shrink-0 flex flex-col sm:flex-row gap-2">{children}</div>
    </div>
  );
}

// --- Header (Record Other Payment) ------------------------------------------

async function OtherIncomeHeader() {
  const header = await loadHeaderData();
  return (
    <HeaderShell>
      {header?.flats ? (
        <RecordPaymentButton
          flats={header.flats}
          buildingName={header.buildingName}
          buildingId={header.buildingId}
          defaultCategory="other"
          label="Record Other Payment"
        />
      ) : null}
    </HeaderShell>
  );
}

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

// --- KPI strip --------------------------------------------------------------

/**
 * Four cards: this-month sums for each non-maintenance category plus a total.
 * Single query for current-month payments, then bucketed by category in JS so
 * we don't issue three separate count queries.
 */
async function OtherIncomeKpis() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) return null;
  const supabase = await createClient();

  const today = new Date();
  const ym = today.toISOString().slice(0, 7);

  const { data: monthPayments } = await supabase
    .from("bms_payments")
    .select("amount, category")
    .eq("building_id", profile.building_id)
    .in("category", ["entry_fee", "fine", "other"])
    .gte("payment_date", `${ym}-01`)
    .lt("payment_date", nextMonthFirstDay(ym));

  let entryFees = 0;
  let fines = 0;
  let other = 0;
  for (const p of monthPayments ?? []) {
    const amt = Number(p.amount ?? 0);
    if (p.category === "entry_fee") entryFees += amt;
    else if (p.category === "fine") fines += amt;
    else if (p.category === "other") other += amt;
  }
  const total = entryFees + fines + other;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Kpi label="Entry fees (this month)" value={formatCurrency(entryFees)} />
      <Kpi label="Fines (this month)" value={formatCurrency(fines)} />
      <Kpi label="Other (this month)" value={formatCurrency(other)} />
      <Kpi
        label="Total this month"
        value={formatCurrency(total)}
        accent={total > 0 ? "success" : undefined}
      />
    </div>
  );
}

function nextMonthFirstDay(ym: string): string {
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

// --- Table ------------------------------------------------------------------

async function OtherIncomeTable() {
  const data = await loadOtherIncomeData();
  if (data.noBuilding) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  if (data.rows.length === 0) {
    return (
      <div className="space-y-3">
        <div className="card-soft text-center py-12">
          <p className="text-muted-foreground">
            No entry fees, fines, or other payments recorded yet.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Use the <span className="font-semibold">Record Other Payment</span> button
            above to add the first one.
          </p>
        </div>
        <CrossLinkFooter />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PaymentsList payments={data.rows} />
      <CrossLinkFooter />
    </div>
  );
}

function CrossLinkFooter() {
  // Small cross-link, not a prominent button. Helps admins discover that the
  // two streams (maintenance vs. other) now live on separate pages.
  return (
    <p className="text-sm text-muted-foreground">
      Maintenance payments →{" "}
      <Link
        href="/admin/maintenance?tab=payments"
        className="text-primary hover:underline"
      >
        /admin/maintenance
      </Link>
    </p>
  );
}

async function loadOtherIncomeData() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return { noBuilding: true as const };
  }
  const supabase = await createClient();

  const [{ data: payments }, { data: flats }, { data: building }] = await Promise.all([
    // Non-maintenance payments only. Mirrors the maintenance page's payments
    // loader pattern (select + joins-via-id-lookups) so the row shape is
    // identical and PaymentsList can be reused unchanged.
    supabase
      .from("bms_payments")
      .select(
        "id, payment_date, flat_id, resident_id, amount, payment_mode, category, receipt_no, legacy_receipt_no, recorded_by, invoice_id, reference_no, received_by_name, received_by_position",
      )
      .eq("building_id", profile.building_id)
      .in("category", ["entry_fee", "fine", "other"])
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
