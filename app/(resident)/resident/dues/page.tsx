import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DuesPill } from "@/components/resident/dues-pill";
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
  receipt_no: number | null;
  notes: string | null;
  received_by_name: string | null;
  received_by_position: string | null;
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
        <DuesContent profileId={profile.id} buildingId={profile.building_id} />
      </Suspense>
    </div>
  );
}

async function DuesContent({
  profileId,
  buildingId,
}: {
  profileId: string;
  buildingId: string | null;
}) {
  const supabase = await createClient();

  // Receipt PDF rendering moved to /resident/payments/[id]/receipt — this
  // page no longer needs to preload building / resident name.
  const { data: residentRows } = await supabase
    .from("bms_residents")
    .select("id, flat_id, is_primary, bms_flats(id, flat_number)")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false });
  void buildingId;

  type FlatBasic = { id: string; flat_number: string };
  type ResidentRow = {
    id: string;
    flat_id: string;
    is_primary: boolean | null;
    bms_flats: FlatBasic | FlatBasic[] | null;
  };
  const rows = (residentRows ?? []) as unknown as ResidentRow[];
  const flats: FlatBasic[] = rows
    .map((r) => (Array.isArray(r.bms_flats) ? r.bms_flats[0] : r.bms_flats))
    .filter((f): f is FlatBasic => !!f);
  const residentIds = rows.map((r) => r.id).filter(Boolean);
  const flatIds = flats.map((f) => f.id);
  const flatNumberById = new Map(flats.map((f) => [f.id, f.flat_number]));
  const multiFlat = flats.length > 1;

  type LevyChargeRow = {
    id: string;
    levy_id: string;
    amount: number;
    due_date: string;
    status: string;
    bms_levies: { name: string; description: string | null } | { name: string; description: string | null }[] | null;
  };

  let invoices: InvoiceRow[] = [];
  let payments: PaymentRow[] = [];
  let openCredits = 0;
  let levyCharges: LevyChargeRow[] = [];

  if (flatIds.length > 0) {
    const [{ data: inv }, { data: pay }, { data: credits }, { data: lc }] = await Promise.all([
      supabase
        .from("bms_invoices")
        .select("id, flat_id, invoice_number, billing_month, amount, status, due_date, notes")
        .in("flat_id", flatIds)
        .order("billing_month", { ascending: false }),
      supabase
        .from("bms_payments")
        .select("id, invoice_id, amount, payment_date, payment_mode, reference_no, category, receipt_no, notes, received_by_name, received_by_position")
        .in("flat_id", flatIds)
        .order("payment_date", { ascending: false }),
      supabase
        .from("bms_flat_credits")
        .select("amount")
        .in("flat_id", flatIds)
        .is("applied_invoice_id", null),
      residentIds.length > 0
        ? supabase
            .from("bms_levy_charges")
            .select("id, levy_id, amount, due_date, status, bms_levies(name, description)")
            .in("resident_id", residentIds)
            .order("due_date", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
    invoices = (inv ?? []) as InvoiceRow[];
    payments = (pay ?? []) as PaymentRow[];
    levyCharges = (lc ?? []) as LevyChargeRow[];
    openCredits = (credits ?? []).reduce(
      (s, c) => s + Number((c as { amount: number }).amount ?? 0),
      0,
    );
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
  const pendingLevyTotal = levyCharges
    .filter((lc) => lc.status === "pending")
    .reduce((s, lc) => s + Number(lc.amount), 0);
  const hasUnresolvedLevies = pendingLevyTotal > 0;
  // Per UX rule: never surface the word "Pending" in resident UI.
  const totalStillDueYTD = Math.max(0, totalBilled - totalPaidYTD) + pendingLevyTotal;

  // Status pills are amount-derived (CLAUDE.md UX rule). An invoice with
  // status='partial' but amount_paid === amount is treated as cleared,
  // and any invoice with amount_due > 0 surfaces as "still due" — never
  // the words "pending" or "partial".
  const stillDue = invoices.filter((i) => {
    if (i.status === "waived") return false;
    const paid = paidByInvoice.get(i.id) ?? 0;
    return Number(i.amount) - paid > 0;
  });
  const cleared = invoices.filter((i) => {
    if (i.status === "waived") return true;
    const paid = paidByInvoice.get(i.id) ?? 0;
    return Number(i.amount) - paid <= 0;
  });

  return (
    <>
      {openCredits > 0 && (
        <div className="rounded-lg border border-[hsl(151_70%_55%/0.30)] bg-[hsl(151_70%_55%/0.06)] p-3 text-sm">
          <span className="font-semibold text-[hsl(151_70%_55%)]">
            {formatCurrency(openCredits)} credit
          </span>
          <span className="text-muted-foreground">
            {" "}— will apply to your next bill automatically.
          </span>
        </div>
      )}

      {(stillDue.length > 1 || hasUnresolvedLevies) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold text-destructive">
              {stillDue.length} bills still due
            </span>
            <span className="text-muted-foreground"> — please clear soon to avoid late fees.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Billed (YTD)" value={formatCurrency(totalBilled)} />
        <Kpi label="Paid (YTD)" value={formatCurrency(totalPaidYTD)} tone="success" />
        <Kpi
          label="Still due (YTD)"
          value={formatCurrency(totalStillDueYTD)}
          tone={totalStillDueYTD > 0 ? "danger" : "neutral"}
        />
      </div>

      <Section title="Bills still due" count={stillDue.length}>
        {stillDue.length === 0 ? (
          <EmptyRow text="All clear — thank you." />
        ) : (
          <DuesTable
            rows={stillDue}
            paidByInvoice={paidByInvoice}
            flatNumberById={flatNumberById}
            lastPaymentByInvoice={lastPaymentByInvoice}
            showFlat={multiFlat}
          />
        )}
      </Section>

      <Section title="Payment history" count={cleared.length}>
        {cleared.length === 0 ? (
          <EmptyRow text="No cleared bills yet." />
        ) : (
          <DuesTable
            rows={cleared}
            paidByInvoice={paidByInvoice}
            flatNumberById={flatNumberById}
            lastPaymentByInvoice={lastPaymentByInvoice}
            showFlat={multiFlat}
          />
        )}
      </Section>

      {levyCharges.length > 0 && (
        <Section title="Special Levy Charges" count={levyCharges.length}>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Levy</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Due</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {levyCharges.map((lc) => {
                  const levy = Array.isArray(lc.bms_levies)
                    ? lc.bms_levies[0]
                    : lc.bms_levies;
                  return (
                    <tr key={lc.id} className="border-t border-border hover:bg-secondary/40">
                      <td className="px-4 py-3">
                        <p className="font-medium">{levy?.name ?? "Special Levy"}</p>
                        {levy?.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {levy.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {formatCurrency(Number(lc.amount))}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {formatDate(lc.due_date)}
                      </td>
                      <td className="px-4 py-3">
                        {lc.status === "paid" ? (
                          <span className="status-paid">Paid</span>
                        ) : lc.status === "waived" ? (
                          <span className="status-waived">Waived</span>
                        ) : (
                          <span className="status-pending">Still due</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
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
  showFlat,
}: {
  rows: InvoiceRow[];
  paidByInvoice: Map<string, number>;
  flatNumberById: Map<string, string>;
  lastPaymentByInvoice: Map<string, PaymentRow>;
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
                  <DuesPill
                    status={i.status}
                    amount={Number(i.amount)}
                    paidTotal={paid}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  {paid > 0 && lp ? (
                    <Link
                      href={`/resident/payments/${lp.id}/receipt`}
                      target="_blank"
                      rel="noopener"
                      className="text-primary hover:underline text-xs"
                    >
                      Receipt
                    </Link>
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
