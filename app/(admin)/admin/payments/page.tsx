import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PaymentsList, type PaymentRow } from "@/components/admin/payments/payments-list";
import { RecordPaymentButton } from "@/components/admin/payments/record-payment-button";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Payments</h1>
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  const supabase = await createClient();

  const [{ data: payments }, { data: flats }, { data: building }] = await Promise.all([
    supabase
      .from("bms_payments")
      .select("id, payment_date, flat_id, resident_id, amount, payment_mode, category, receipt_no, recorded_by, invoice_id, reference_no")
      .eq("building_id", profile.building_id)
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
    recorded_by_name: p.recorded_by ? recMap.get(p.recorded_by) ?? null : null,
    reference_no: p.reference_no,
    invoice_number: p.invoice_id ? invMap.get(p.invoice_id)?.number ?? null : null,
    billing_month: p.invoice_id ? invMap.get(p.invoice_id)?.month ?? null : null,
  }));

  const today = new Date();
  const ym = today.toISOString().slice(0, 7);
  const monthTotal = rows
    .filter((p) => (p.payment_date ?? "").slice(0, 7) === ym)
    .reduce((s, p) => s + p.amount, 0);
  const flatOptions = (flats ?? []).map((f) => ({
    id: f.id,
    flat_number: f.flat_number,
    outstanding_dues: Number(f.outstanding_dues ?? 0),
  }));

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1>Payments</h1>
          <p className="text-muted-foreground">Money received from residents.</p>
        </div>
        <RecordPaymentButton flats={flatOptions} buildingName={building?.name ?? "Building"} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">This month collected</div>
          <div className="mt-1 text-2xl font-bold">{formatCurrency(monthTotal)}</div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Total records</div>
          <div className="mt-1 text-2xl font-bold">{rows.length}</div>
        </div>
      </div>

      <PaymentsList
        payments={rows}
        buildingName={building?.name ?? "Building"}
      />
    </div>
  );
}
