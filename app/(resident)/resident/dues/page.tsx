import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
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

  // Normalize invoices + levy charges into one row shape so all three sections
  // render through the same table — identical columns, widths and alignment.
  const invoiceToRow = (i: InvoiceRow): DuesRow => {
    const paid = paidByInvoice.get(i.id) ?? 0;
    const lp = lastPaymentByInvoice.get(i.id);
    const due = Number(i.amount) - paid;
    const kind: DuesRow["statusKind"] =
      i.status === "waived" ? "waived" : due <= 0 ? "cleared" : "due";
    return {
      id: i.id,
      primary: formatDate(i.billing_month),
      secondary: multiFlat ? (flatNumberById.get(i.flat_id) ?? null) : null,
      amount: Number(i.amount),
      paid,
      dueDate: i.due_date,
      statusKind: kind,
      receiptHref: paid > 0 && lp ? `/resident/payments/${lp.id}/receipt` : null,
    };
  };

  const stillDueRows = stillDue.map(invoiceToRow);
  const clearedRows = cleared.map(invoiceToRow);
  const levyRows: DuesRow[] = levyCharges.map((lc) => {
    const levy = Array.isArray(lc.bms_levies) ? lc.bms_levies[0] : lc.bms_levies;
    const kind: DuesRow["statusKind"] =
      lc.status === "paid" ? "cleared" : lc.status === "waived" ? "waived" : "due";
    return {
      id: lc.id,
      primary: levy?.name ?? "Special Levy",
      secondary: levy?.description ?? null,
      amount: Number(lc.amount),
      paid: lc.status === "paid" ? Number(lc.amount) : 0,
      dueDate: lc.due_date,
      statusKind: kind,
      receiptHref: null,
    };
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
        {stillDueRows.length === 0 ? (
          <EmptyRow text="All clear — thank you." />
        ) : (
          <DuesTable firstLabel="Month" rows={stillDueRows} />
        )}
      </Section>

      <Section title="Payment history" count={cleared.length}>
        {clearedRows.length === 0 ? (
          <EmptyRow text="No cleared bills yet." />
        ) : (
          <DuesTable firstLabel="Month" rows={clearedRows} />
        )}
      </Section>

      {levyRows.length > 0 && (
        <Section title="Special Levy Charges" count={levyRows.length}>
          <DuesTable firstLabel="Levy" rows={levyRows} />
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

// One normalized row shape for every dues section (bills + levies) so they all
// render through the same table with identical columns, widths and alignment.
type DuesRow = {
  id: string;
  primary: string; // Month (bills) or Levy name
  secondary: string | null; // Flat (multi-flat) or levy description
  amount: number;
  paid: number;
  dueDate: string | null;
  statusKind: "cleared" | "due" | "waived";
  receiptHref: string | null;
};

function DuesTable({ firstLabel, rows }: { firstLabel: string; rows: DuesRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      {/* table-fixed + colgroup → every section lines up; min-w keeps it scrollable on mobile */}
      <table className="w-full text-sm table-fixed min-w-[600px]">
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[16%]" />
          <col className="w-[14%]" />
          <col className="w-[16%]" />
          <col className="w-[14%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="bg-secondary/60 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium text-left">{firstLabel}</th>
            <th className="px-4 py-2.5 font-medium text-right">Amount</th>
            <th className="px-4 py-2.5 font-medium text-right">Paid</th>
            <th className="px-4 py-2.5 font-medium text-left">Due</th>
            <th className="px-4 py-2.5 font-medium text-left">Status</th>
            <th className="px-4 py-2.5 font-medium text-right">Receipt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
              <td className="px-4 py-3">
                <p className="font-medium tabular-nums truncate">{r.primary}</p>
                {r.secondary && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {r.secondary}
                  </p>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-medium">
                {formatCurrency(r.amount)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {r.paid > 0 ? formatCurrency(r.paid) : "—"}
              </td>
              <td className="px-4 py-3 text-left text-muted-foreground tabular-nums">
                {r.dueDate ? formatDate(r.dueDate) : "—"}
              </td>
              <td className="px-4 py-3 text-left">
                <DuesStatusPill kind={r.statusKind} />
              </td>
              <td className="px-4 py-3 text-right">
                {r.receiptHref ? (
                  <Link
                    href={r.receiptHref}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Compact, uniform status pill — same size/shape across all sections. Token
// classes match the app's status palette (already compiled, no JIT risk).
function DuesStatusPill({ kind }: { kind: "cleared" | "due" | "waived" }) {
  const cls =
    kind === "cleared"
      ? "bg-[hsl(151_70%_55%/0.12)] text-[hsl(151_70%_55%)] border-[hsl(151_70%_55%/0.30)]"
      : kind === "waived"
        ? "bg-muted/40 text-muted-foreground border-border"
        : "bg-destructive/15 text-destructive border-destructive/30";
  const label = kind === "cleared" ? "Cleared" : kind === "waived" ? "Waived" : "Still due";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}
    >
      {label}
    </span>
  );
}
