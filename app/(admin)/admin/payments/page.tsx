import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { createClient } from "@/lib/supabase/server";
import { PaymentsList, type PaymentRow } from "@/components/admin/payments/payments-list";
import { RecordPaymentButton } from "@/components/admin/payments/record-payment-button";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

/**
 * /admin/payments — the full maintenance payment ledger (receipts + undo).
 *
 * Reachable from the Maintenance screen's "All payments →" link. The day-to-day
 * flow (who owes, record, remind, receipt) lives on /admin/maintenance as a
 * single monthly flat list; this page is the transaction log for reconciliation
 * and correcting a mis-entered payment.
 */
export default async function PaymentsLedgerPage() {
  // The flat picker is a small, fast query — load it up front so the
  // "Record Payment" button can sit on the title row. The heavy payments
  // list still streams in its own Suspense boundary below.
  const header = await loadFlatPicker();

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/maintenance"
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Back to Maintenance"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1>Payments</h1>
        </div>
        {header && header.flatPickerOptions.length > 0 && (
          <RecordPaymentButton
            flats={header.flatPickerOptions}
            buildingName={header.buildingName}
            buildingId={header.buildingId}
          />
        )}
      </div>

      <Suspense fallback={<TableSkeleton rows={8} />}>
        <PaymentsLedger />
      </Suspense>
    </div>
  );
}

async function PaymentsLedger() {
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
      <PaymentsList payments={data.rows} canDelete />
      <p className="text-sm text-muted-foreground">
        Looking for entry fees / fines? →{" "}
        <Link href="/admin/other-income" className="text-primary hover:underline">
          Other Income
        </Link>
      </p>
    </div>
  );
}

/**
 * Lightweight loader for the "Record Payment" button on the title row —
 * just the flat picker and building, so the header doesn't wait on the
 * full (limit-500 + joins) payments query that streams below.
 */
async function loadFlatPicker() {
  await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) return null;
  const supabase = await createClient();

  const [{ data: flats }, { data: building }] = await Promise.all([
    supabase
      .from("bms_flats")
      .select("id, flat_number, outstanding_dues")
      .eq("building_id", buildingId)
      .order("flat_number"),
    supabase.from("bms_buildings").select("name").eq("id", buildingId).single(),
  ]);

  return {
    buildingId,
    buildingName: building?.name ?? "Building",
    flatPickerOptions: (flats ?? []).map((f) => ({
      id: f.id,
      flat_number: f.flat_number,
      outstanding_dues: Number(f.outstanding_dues ?? 0),
    })),
  };
}

async function loadPaymentsData() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) {
    return { noBuilding: true as const };
  }
  const supabase = await createClient();

  const [{ data: payments }, { data: flats }, { data: building }] = await Promise.all([
    // Maintenance payments only. Entry fees / fines / "other" live on
    // /admin/other-income so this ledger stays focused on the monthly flow.
    supabase
      .from("bms_payments")
      .select(
        "id, payment_date, flat_id, resident_id, amount, payment_mode, category, receipt_no, legacy_receipt_no, recorded_by, invoice_id, reference_no, received_by_name, received_by_position, payment_group_id",
      )
      .eq("building_id", buildingId)
      .eq("category", "maintenance")
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("bms_flats")
      .select("id, flat_number, outstanding_dues")
      .eq("building_id", buildingId)
      .order("flat_number"),
    supabase.from("bms_buildings").select("name").eq("id", buildingId).single(),
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
    payment_group_id: (p as { payment_group_id?: string | null }).payment_group_id ?? null,
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
    buildingId,
    flatPickerOptions: (flats ?? []).map((f) => ({
      id: f.id,
      flat_number: f.flat_number,
      outstanding_dues: Number(f.outstanding_dues ?? 0),
    })),
  };
}
