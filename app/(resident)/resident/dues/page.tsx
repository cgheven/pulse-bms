import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusPill } from "@/components/resident/status-pill";
import { ReceiptButton, type ReceiptData } from "@/components/resident/receipt-button";
import { AlertTriangle } from "lucide-react";

type InvoiceRow = {
  id: string;
  flat_id: string;
  invoice_number: string;
  billing_month: string;
  amount: number;
  status: string | null;
  due_date: string | null;
  notes: string | null;
};

type PaymentRow = {
  id: string;
  invoice_id: string | null;
  amount: number;
  payment_date: string | null;
  payment_mode: string | null;
  reference_no: string | null;
  category: string | null;
  receipt_no: string | null;
  notes: string | null;
};

export default async function ResidentDuesPage() {
  const { profile } = await requireRole("resident");
  const supabase = await createClient();

  // building (for receipt)
  let building: { name: string; address: string | null; city: string | null } | null = null;
  if (profile.building_id) {
    const { data } = await supabase
      .from("bms_buildings")
      .select("name, address, city")
      .eq("id", profile.building_id)
      .maybeSingle();
    building = data ?? null;
  }

  // resident's flats
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

  let invoices: InvoiceRow[] = [];
  let payments: PaymentRow[] = [];
  if (flatIds.length > 0) {
    const [{ data: inv }, { data: pay }] = await Promise.all([
      supabase
        .from("bms_invoices")
        .select("id, flat_id, invoice_number, billing_month, amount, status, due_date, notes")
        .in("flat_id", flatIds)
        .order("billing_month", { ascending: false }),
      supabase
        .from("bms_payments")
        .select("id, invoice_id, amount, payment_date, payment_mode, reference_no, category, receipt_no, notes")
        .in("flat_id", flatIds)
        .order("payment_date", { ascending: false }),
    ]);
    invoices = (inv ?? []) as InvoiceRow[];
    payments = (pay ?? []) as PaymentRow[];
  }

  // map paid_amount per invoice
  const paidByInvoice = new Map<string, number>();
  for (const p of payments) {
    if (!p.invoice_id) continue;
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount));
  }

  // last payment per invoice (for receipt)
  const lastPaymentByInvoice = new Map<string, PaymentRow>();
  for (const p of payments) {
    if (!p.invoice_id) continue;
    if (!lastPaymentByInvoice.has(p.invoice_id)) lastPaymentByInvoice.set(p.invoice_id, p);
  }

  // yearly summary (current calendar year)
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const ytdInvoices = invoices.filter((i) => i.billing_month >= yearStart);
  const totalBilled = ytdInvoices.reduce((s, i) => s + Number(i.amount), 0);
  const totalPaidYTD = ytdInvoices.reduce(
    (s, i) => s + (paidByInvoice.get(i.id) ?? 0),
    0
  );
  const totalPendingYTD = Math.max(0, totalBilled - totalPaidYTD);

  const pending = invoices.filter((i) => i.status !== "paid" && i.status !== "waived");
  const paidOrWaived = invoices.filter((i) => i.status === "paid" || i.status === "waived");

  const pendingMonths = pending.length;

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1>My Dues</h1>
        <p className="text-lg text-muted-foreground mt-2">Your maintenance bills and payment status.</p>
      </div>

      {pendingMonths > 1 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-destructive shrink-0" />
          <div>
            <div className="font-semibold text-lg text-destructive">
              {pendingMonths} pending bills
            </div>
            <div className="text-base text-muted-foreground">
              Please clear pending dues to avoid late fees.
            </div>
          </div>
        </div>
      )}

      {/* Yearly summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Total Billed (this year)</div>
          <div className="text-3xl font-bold mt-2">{formatCurrency(totalBilled)}</div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Total Paid (this year)</div>
          <div className="text-3xl font-bold mt-2 text-[hsl(151_70%_28%)]">{formatCurrency(totalPaidYTD)}</div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Total Pending (this year)</div>
          <div className={`text-3xl font-bold mt-2 ${totalPendingYTD > 0 ? "text-destructive" : ""}`}>
            {formatCurrency(totalPendingYTD)}
          </div>
        </div>
      </div>

      {/* Pending invoices */}
      <section>
        <h2 className="text-2xl font-semibold mb-3">Pending Bills</h2>
        {pending.length === 0 ? (
          <div className="card-soft text-base text-muted-foreground">No pending bills. You are all clear.</div>
        ) : (
          <DuesTable
            rows={pending}
            paidByInvoice={paidByInvoice}
            flatNumberById={flatNumberById}
            lastPaymentByInvoice={lastPaymentByInvoice}
            building={building}
            residentName={profile.full_name}
          />
        )}
      </section>

      {/* Paid history */}
      <section>
        <h2 className="text-2xl font-semibold mb-3">Payment History</h2>
        {paidOrWaived.length === 0 ? (
          <div className="card-soft text-base text-muted-foreground">No paid bills yet.</div>
        ) : (
          <DuesTable
            rows={paidOrWaived}
            paidByInvoice={paidByInvoice}
            flatNumberById={flatNumberById}
            lastPaymentByInvoice={lastPaymentByInvoice}
            building={building}
            residentName={profile.full_name}
          />
        )}
      </section>
    </div>
  );
}

function DuesTable({
  rows,
  paidByInvoice,
  flatNumberById,
  lastPaymentByInvoice,
  building,
  residentName,
}: {
  rows: InvoiceRow[];
  paidByInvoice: Map<string, number>;
  flatNumberById: Map<string, string>;
  lastPaymentByInvoice: Map<string, PaymentRow>;
  building: { name: string; address: string | null; city: string | null } | null;
  residentName: string | null;
}) {
  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <table className="w-full text-base">
        <thead className="bg-secondary text-left">
          <tr>
            <th className="px-4 py-3 font-semibold">Month</th>
            <th className="px-4 py-3 font-semibold">Flat</th>
            <th className="px-4 py-3 font-semibold text-right">Amount</th>
            <th className="px-4 py-3 font-semibold text-right">Paid</th>
            <th className="px-4 py-3 font-semibold">Due Date</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold text-right">Receipt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const paid = paidByInvoice.get(i.id) ?? 0;
            const lp = lastPaymentByInvoice.get(i.id);
            const flatNum = flatNumberById.get(i.flat_id) ?? "-";
            const receipt: ReceiptData = {
              building_name: building?.name ?? "Building",
              building_address: building?.address,
              building_city: building?.city,
              flat_number: flatNum,
              resident_name: residentName,
              receipt_no: lp?.receipt_no ?? null,
              invoice_number: i.invoice_number,
              payment_date: lp?.payment_date ?? null,
              payment_mode: lp?.payment_mode ?? null,
              reference_no: lp?.reference_no ?? null,
              category: lp?.category ?? "Maintenance",
              billing_month: i.billing_month,
              amount: paid > 0 ? paid : Number(i.amount),
              notes: lp?.notes ?? i.notes,
            };
            return (
              <tr key={i.id} className="border-t hover:bg-secondary/40">
                <td className="px-4 py-4 font-semibold">{formatDate(i.billing_month)}</td>
                <td className="px-4 py-4">{flatNum}</td>
                <td className="px-4 py-4 text-right font-semibold">{formatCurrency(Number(i.amount))}</td>
                <td className="px-4 py-4 text-right">{formatCurrency(paid)}</td>
                <td className="px-4 py-4">{i.due_date ? formatDate(i.due_date) : "—"}</td>
                <td className="px-4 py-4"><StatusPill status={i.status} /></td>
                <td className="px-4 py-4 text-right">
                  {i.status === "paid" && lp ? (
                    <ReceiptButton data={receipt} label="Download" />
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
