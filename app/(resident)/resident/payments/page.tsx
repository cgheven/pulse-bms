import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, capitalize } from "@/lib/utils";
import { ReceiptButton, type ReceiptData } from "@/components/resident/receipt-button";

type PaymentRow = {
  id: string;
  invoice_id: string | null;
  flat_id: string | null;
  amount: number;
  payment_date: string | null;
  payment_mode: string | null;
  reference_no: string | null;
  category: string | null;
  receipt_no: string | null;
  notes: string | null;
  bms_invoices: { invoice_number: string; billing_month: string } | { invoice_number: string; billing_month: string }[] | null;
};

export default async function ResidentPaymentsPage() {
  const { profile } = await requireRole("resident");
  const supabase = await createClient();

  let building: { name: string; address: string | null; city: string | null } | null = null;
  if (profile.building_id) {
    const { data } = await supabase
      .from("bms_buildings")
      .select("name, address, city")
      .eq("id", profile.building_id)
      .maybeSingle();
    building = data ?? null;
  }

  const { data: residentRows } = await supabase
    .from("bms_residents")
    .select("flat_id, is_primary, bms_flats(id, flat_number)")
    .eq("profile_id", profile.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false });

  type FlatBasic = { id: string; flat_number: string };
  type ResidentRow = {
    flat_id: string;
    is_primary: boolean | null;
    bms_flats: FlatBasic | FlatBasic[] | null;
  };
  const flats: FlatBasic[] = ((residentRows ?? []) as unknown as ResidentRow[])
    .map((r) => (Array.isArray(r.bms_flats) ? r.bms_flats[0] : r.bms_flats))
    .filter((f): f is FlatBasic => !!f);
  const flatIds = flats.map((f) => f.id);
  const flatNumberById = new Map(flats.map((f) => [f.id, f.flat_number]));

  let payments: PaymentRow[] = [];
  if (flatIds.length > 0) {
    const { data } = await supabase
      .from("bms_payments")
      .select("id, invoice_id, flat_id, amount, payment_date, payment_mode, reference_no, category, receipt_no, notes, bms_invoices(invoice_number, billing_month)")
      .in("flat_id", flatIds)
      .order("payment_date", { ascending: false });
    payments = (data ?? []) as unknown as PaymentRow[];
  }

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1>My Payments</h1>
        <p className="text-lg text-muted-foreground mt-2">
          All payments you have made. Download a receipt for any of them.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Total Payments</div>
          <div className="text-3xl font-bold mt-1">{payments.length}</div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Total Paid (all-time)</div>
          <div className="text-3xl font-bold mt-1 text-[hsl(151_70%_28%)]">{formatCurrency(totalPaid)}</div>
        </div>
      </div>

      {payments.length === 0 ? (
        <div className="card-soft text-base text-muted-foreground">
          No payments recorded yet.
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-base">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Flat</th>
                <th className="px-4 py-3 font-semibold text-right">Amount</th>
                <th className="px-4 py-3 font-semibold">Mode</th>
                <th className="px-4 py-3 font-semibold">Reference</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Receipt No</th>
                <th className="px-4 py-3 font-semibold text-right">Download</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const invoice = Array.isArray(p.bms_invoices) ? p.bms_invoices[0] : p.bms_invoices;
                const flatNum = p.flat_id ? flatNumberById.get(p.flat_id) ?? "—" : "—";
                const data: ReceiptData = {
                  building_name: building?.name ?? "Building",
                  building_address: building?.address,
                  building_city: building?.city,
                  flat_number: flatNum,
                  resident_name: profile.full_name,
                  receipt_no: p.receipt_no,
                  invoice_number: invoice?.invoice_number ?? null,
                  payment_date: p.payment_date,
                  payment_mode: p.payment_mode,
                  reference_no: p.reference_no,
                  category: p.category ?? "Maintenance",
                  billing_month: invoice?.billing_month ?? null,
                  amount: Number(p.amount),
                  notes: p.notes,
                };
                return (
                  <tr key={p.id} className="border-t hover:bg-secondary/40">
                    <td className="px-4 py-4 font-semibold">
                      {p.payment_date ? formatDate(p.payment_date) : "—"}
                    </td>
                    <td className="px-4 py-4">{flatNum}</td>
                    <td className="px-4 py-4 text-right font-semibold">{formatCurrency(Number(p.amount))}</td>
                    <td className="px-4 py-4">{p.payment_mode ? capitalize(p.payment_mode) : "—"}</td>
                    <td className="px-4 py-4 text-muted-foreground">{p.reference_no ?? "—"}</td>
                    <td className="px-4 py-4">{p.category ? capitalize(p.category) : "Maintenance"}</td>
                    <td className="px-4 py-4">{p.receipt_no ?? "—"}</td>
                    <td className="px-4 py-4 text-right">
                      <ReceiptButton data={data} label="Receipt PDF" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
