import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusPill } from "@/components/resident/status-pill";
import { ReceiptButton, type ReceiptData } from "@/components/resident/receipt-button";
import { TableSkeleton, KpiRowSkeleton } from "@/components/layout/table-skeleton";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

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

  return (
    <div className="space-y-5 animate-fade-up max-w-5xl">
      <header>
        <h1>My Dues</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Maintenance bills and payment status.
        </p>
      </header>

      <Suspense fallback={<KpiRowSkeleton count={3} />}>
        <DuesContent profileId={profile.id} buildingId={profile.building_id} residentName={profile.full_name} />
      </Suspense>
    </div>
  );
}

async function DuesContent({
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

  const paidByInvoice = new Map<string, number>();
  for (const p of payments) {
    if (!p.invoice_id) continue;
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount));
  }

  const lastPaymentByInvoice = new Map<string, PaymentRow>();
  for (const p of payments) {
    if (!p.invoice_id) continue;
    if (!lastPaymentByInvoice.has(p.invoice_id)) lastPaymentByInvoice.set(p.invoice_id, p);
  }

  const yearStart = `${new Date().getFullYear()}-01-01`;
  const ytdInvoices = invoices.filter((i) => i.billing_month >= yearStart);
  const totalBilled = ytdInvoices.reduce((s, i) => s + Number(i.amount), 0);
  const totalPaidYTD = ytdInvoices.reduce(
    (s, i) => s + (paidByInvoice.get(i.id) ?? 0),
    0,
  );
  const totalPendingYTD = Math.max(0, totalBilled - totalPaidYTD);

  const pending = invoices.filter((i) => i.status !== "paid" && i.status !== "waived");
  const paidOrWaived = invoices.filter((i) => i.status === "paid" || i.status === "waived");

  return (
    <>
      {pending.length > 1 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold text-destructive">
              {pending.length} pending bills
            </span>
            <span className="text-muted-foreground"> — please clear soon to avoid late fees.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Billed (YTD)" value={formatCurrency(totalBilled)} />
        <Kpi label="Paid (YTD)" value={formatCurrency(totalPaidYTD)} tone="success" />
        <Kpi
          label="Pending"
          value={formatCurrency(totalPendingYTD)}
          tone={totalPendingYTD > 0 ? "danger" : "neutral"}
        />
      </div>

      <Section title="Pending bills" count={pending.length}>
        {pending.length === 0 ? (
          <EmptyRow text="No pending bills. You are all clear." />
        ) : (
          <DuesTable
            rows={pending}
            paidByInvoice={paidByInvoice}
            flatNumberById={flatNumberById}
            lastPaymentByInvoice={lastPaymentByInvoice}
            building={building ?? null}
            residentName={residentName}
            showFlat={multiFlat}
          />
        )}
      </Section>

      <Section title="Payment history" count={paidOrWaived.length}>
        {paidOrWaived.length === 0 ? (
          <EmptyRow text="No paid bills yet." />
        ) : (
          <DuesTable
            rows={paidOrWaived}
            paidByInvoice={paidByInvoice}
            flatNumberById={flatNumberById}
            lastPaymentByInvoice={lastPaymentByInvoice}
            building={building ?? null}
            residentName={residentName}
            showFlat={multiFlat}
          />
        )}
      </Section>
    </>
  );
}

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-[hsl(151_70%_55%)]"
      : tone === "danger"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-xl sm:text-2xl font-semibold tracking-tight tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <span className="text-[11px] text-muted-foreground tabular-nums">{count}</span>
      </div>
      {children}
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
      {text}
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
  showFlat,
}: {
  rows: InvoiceRow[];
  paidByInvoice: Map<string, number>;
  flatNumberById: Map<string, string>;
  lastPaymentByInvoice: Map<string, PaymentRow>;
  building: { name: string; address: string | null; city: string | null } | null;
  residentName: string | null;
  showFlat: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Month</th>
            {showFlat && <th className="px-4 py-2.5 font-medium">Flat</th>}
            <th className="px-4 py-2.5 font-medium text-right">Amount</th>
            <th className="px-4 py-2.5 font-medium text-right">Paid</th>
            <th className="px-4 py-2.5 font-medium">Due</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium text-right">Receipt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const paid = paidByInvoice.get(i.id) ?? 0;
            const lp = lastPaymentByInvoice.get(i.id);
            const flatNum = flatNumberById.get(i.flat_id) ?? "—";
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
              <tr key={i.id} className="border-t border-border hover:bg-secondary/40">
                <td className="px-4 py-3 font-medium tabular-nums">
                  {formatDate(i.billing_month)}
                </td>
                {showFlat && <td className="px-4 py-3 tabular-nums">{flatNum}</td>}
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatCurrency(Number(i.amount))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {paid > 0 ? formatCurrency(paid) : "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  {i.due_date ? formatDate(i.due_date) : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={i.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  {i.status === "paid" && lp ? (
                    <ReceiptButton data={receipt} label="Download" />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
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
