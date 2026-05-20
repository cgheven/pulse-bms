import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, capitalize } from "@/lib/utils";
import { ReceiptButton, type ReceiptData } from "@/components/resident/receipt-button";
import { TableSkeleton, KpiRowSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

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
  received_by_name: string | null;
  received_by_position: string | null;
  bms_invoices:
    | { invoice_number: string; billing_month: string; amount: number }
    | { invoice_number: string; billing_month: string; amount: number }[]
    | null;
};

export default async function ResidentPaymentsPage() {
  const { profile } = await requireRole("resident");

  return (
    <div className="space-y-5 animate-fade-up max-w-5xl">
      <header>
        <h1>Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your payment history. Tap any row to download a receipt.
        </p>
      </header>

      <Suspense
        fallback={
          <>
            <KpiRowSkeleton count={2} />
            <TableSkeleton rows={6} />
          </>
        }
      >
        <PaymentsContent
          profileId={profile.id}
          buildingId={profile.building_id}
          residentName={profile.full_name}
        />
      </Suspense>
    </div>
  );
}

async function PaymentsContent({
  profileId,
  buildingId,
  residentName,
}: {
  profileId: string;
  buildingId: string | null;
  residentName: string | null;
}) {
  const supabase = await createClient();

  const [{ data: building }, { data: residentRows }] = await Promise.all([
    buildingId
      ? supabase
          .from("bms_buildings")
          .select("name, address, city")
          .eq("id", buildingId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("bms_residents")
      .select("flat_id, is_primary, bms_flats(id, flat_number)")
      .eq("profile_id", profileId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false }),
  ]);

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
  const multiFlat = flats.length > 1;

  let payments: PaymentRow[] = [];
  // amountByInvoice stores invoice.amount keyed by invoice_id so each chunk
  // receipt can render the still-due figure. paidByInvoice is the running
  // total INCLUDING the chunk represented by the row; computed
  // chronologically below so chunk N shows the balance as of chunk N.
  const amountByInvoice = new Map<string, number>();
  if (flatIds.length > 0) {
    const { data } = await supabase
      .from("bms_payments")
      .select(
        "id, invoice_id, flat_id, amount, payment_date, payment_mode, reference_no, category, receipt_no, notes, received_by_name, received_by_position, bms_invoices(invoice_number, billing_month, amount)",
      )
      .in("flat_id", flatIds)
      .order("payment_date", { ascending: false });
    payments = (data ?? []) as unknown as PaymentRow[];
    for (const p of payments) {
      const invRel = Array.isArray(p.bms_invoices) ? p.bms_invoices[0] : p.bms_invoices;
      if (p.invoice_id && invRel) {
        amountByInvoice.set(p.invoice_id, Number((invRel as { amount: number }).amount ?? 0));
      }
    }
  }

  // Running total per invoice: each chunk receipt shows the cumulative paid
  // AT THE TIME of that chunk. We iterate chronologically (oldest first) to
  // accumulate, then look up by payment id when rendering.
  const cumulativeByPayment = new Map<string, number>();
  {
    const oldestFirst = [...payments].sort((a, b) =>
      (a.payment_date ?? "").localeCompare(b.payment_date ?? ""),
    );
    const running = new Map<string, number>();
    for (const p of oldestFirst) {
      if (!p.invoice_id) continue;
      const next = (running.get(p.invoice_id) ?? 0) + Number(p.amount);
      running.set(p.invoice_id, next);
      cumulativeByPayment.set(p.id, next);
    }
  }

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Payments
          </div>
          <div className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums">
            {payments.length}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Total paid
          </div>
          <div className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums text-[hsl(151_70%_55%)]">
            {formatCurrency(totalPaid)}
          </div>
        </div>
      </div>

      {payments.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No payments recorded yet.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Bill</th>
                {multiFlat && <th className="px-4 py-2.5 font-medium">Flat</th>}
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium">Method</th>
                <th className="px-4 py-2.5 font-medium">Ref</th>
                <th className="px-4 py-2.5 font-medium text-right">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const invoice = Array.isArray(p.bms_invoices)
                  ? p.bms_invoices[0]
                  : p.bms_invoices;
                const flatNum = p.flat_id ? flatNumberById.get(p.flat_id) ?? "—" : "—";
                const cumulative = cumulativeByPayment.get(p.id);
                const invoiceAmount = p.invoice_id
                  ? amountByInvoice.get(p.invoice_id) ?? null
                  : null;
                const stillDue =
                  invoiceAmount != null && cumulative != null
                    ? Math.max(0, invoiceAmount - cumulative)
                    : null;
                const data: ReceiptData = {
                  building_name: building?.name ?? "Building",
                  building_address: building?.address ?? null,
                  building_city: building?.city ?? null,
                  flat_number: flatNum,
                  resident_name: residentName,
                  receipt_no: p.receipt_no,
                  invoice_number: invoice?.invoice_number ?? null,
                  payment_date: p.payment_date,
                  payment_mode: p.payment_mode,
                  reference_no: p.reference_no,
                  category: p.category ?? "Maintenance",
                  billing_month: invoice?.billing_month ?? null,
                  amount: Number(p.amount),
                  notes: p.notes,
                  total_paid_so_far: cumulative ?? null,
                  still_due: stillDue,
                  invoice_amount: invoiceAmount,
                  received_by_name: p.received_by_name,
                  received_by_position: p.received_by_position,
                };
                const billLabel = invoice?.billing_month
                  ? formatDate(invoice.billing_month)
                  : capitalize(p.category ?? "—");
                const ref = p.receipt_no ?? p.reference_no ?? "—";
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-secondary/40">
                    <td className="px-4 py-3 font-medium tabular-nums">
                      {p.payment_date ? formatDate(p.payment_date) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {billLabel}
                    </td>
                    {multiFlat && <td className="px-4 py-3 tabular-nums">{flatNum}</td>}
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatCurrency(Number(p.amount))}
                    </td>
                    <td className="px-4 py-3 capitalize">{p.payment_mode ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {ref}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ReceiptButton data={data} label="PDF" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
