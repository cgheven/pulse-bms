import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { createClient } from "@/lib/supabase/server";
import { cn, formatCurrency, formatDate, formatLakh, formatMonthLabel, formatPhone, formatReceiptNo } from "@/lib/utils";
import { paidThroughMonth } from "@/lib/paid-through";
import { ArrowLeft, Pencil } from "lucide-react";
import { FlatFormDialog } from "@/components/admin/flats/flat-form-dialog";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { InvoiceStatusPill } from "@/components/admin/billing/invoice-status-pill";
import { FlatExport } from "@/components/admin/flats/flat-export";

export const dynamic = "force-dynamic";

export default async function FlatDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) notFound();
  const supabase = await createClient();

  const { data: flat } = await supabase
    .from("bms_flats")
    .select("*")
    .eq("id", id)
    .eq("building_id", buildingId)
    .single();
  if (!flat) notFound();

  const [{ data: residents }, { data: invoices }, { data: payments }, { data: credits }] = await Promise.all([
    supabase
      .from("bms_residents")
      .select("id, full_name, phone, cnic, relationship, is_primary, is_active, move_in_date, entry_fee_paid")
      .eq("flat_id", id)
      .eq("building_id", buildingId)
      .order("is_primary", { ascending: false })
      .order("full_name"),
    supabase
      .from("bms_invoices")
      .select("id, invoice_number, billing_month, amount, status, due_date")
      .eq("flat_id", id)
      .eq("building_id", buildingId)
      .order("billing_month", { ascending: false })
      .limit(12),
    supabase
      .from("bms_payments")
      .select("id, payment_date, amount, payment_mode, category, receipt_no, invoice_id")
      .eq("flat_id", id)
      .eq("building_id", buildingId)
      .order("payment_date", { ascending: false })
      .limit(20),
    supabase
      .from("bms_flat_credits")
      .select("amount")
      .eq("flat_id", id)
      .eq("building_id", buildingId)
      .is("applied_invoice_id", null),
  ]);

  // Per-invoice paid total — drives the amount-aware status pill.
  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const paidByInvoice = new Map<string, number>();
  if (invoiceIds.length) {
    const { data: pays } = await supabase
      .from("bms_payments")
      .select("invoice_id, amount")
      .in("invoice_id", invoiceIds);
    for (const p of pays ?? []) {
      if (!p.invoice_id) continue;
      paidByInvoice.set(
        p.invoice_id,
        (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0),
      );
    }
  }

  const openCredits = (credits ?? []).reduce(
    (s, c) => s + Number((c as { amount: number }).amount ?? 0),
    0,
  );

  // Answers "is this flat covered, and until when?" — the question a
  // resident who paid six months up front will actually ask. Outstanding
  // dues of zero only means nothing is overdue today.
  const paidThrough = await paidThroughMonth(supabase, buildingId, id);

  // Current month invoice for the at-a-glance status card
  const monthStart = new Date().toISOString().slice(0, 7) + "-01";
  const thisMonth = (invoices ?? []).find((i) => i.billing_month === monthStart);
  const thisMonthPaid = thisMonth ? paidByInvoice.get(thisMonth.id) ?? 0 : 0;

  const { data: building } = await supabase
    .from("bms_buildings")
    .select("name")
    .eq("id", buildingId)
    .single();
  const buildingName = building?.name ?? "Building";

  // One derivation of each invoice's money, used by both the table and the
  // export. Amount, Paid and the outstanding Balance are their own columns now
  // — the "still due" figure no longer hides inside the status pill.
  const invoiceRows = (invoices ?? []).map((inv) => {
    const amount = Number(inv.amount);
    const paid = paidByInvoice.get(inv.id) ?? 0;
    const balance = Math.max(0, amount - paid);
    const status =
      inv.status === "waived" ? "Waived" : balance <= 0 ? "Cleared" : "Due";
    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      month: inv.billing_month as string,
      due: (inv.due_date as string | null) ?? null,
      rawStatus: inv.status ?? "pending",
      amount,
      paid,
      balance,
      status,
    };
  });

  const paymentRows = (payments ?? []).map((p) => ({
    date: (p.payment_date as string | null) ?? null,
    receipt: formatReceiptNo(p.receipt_no as number | null) || "",
    mode: String(p.payment_mode ?? ""),
    category: String(p.category ?? ""),
    amount: Number(p.amount ?? 0),
  }));

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/admin/flats" className="text-muted-foreground hover:text-foreground shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="whitespace-nowrap">Flat {flat.flat_number}</h1>
          <span className="status-info inline-flex px-2.5 py-1 rounded-full text-sm font-medium">
            {flat.ownership_type}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <FlatExport
            flatNumber={flat.flat_number}
            buildingName={buildingName}
            invoices={invoiceRows}
            payments={paymentRows}
          />
          <FlatFormDialog
            initial={{
              id: flat.id,
              flat_number: flat.flat_number,
              floor: flat.floor,
              block: flat.block,
              size_sqft: flat.size_sqft,
              monthly_fee: flat.monthly_fee,
              ownership_type: flat.ownership_type,
              notes: flat.notes,
            }}
            trigger={
              <Button variant="outline">
                <Pencil className="w-4 h-4" />
                Edit Flat
              </Button>
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Floor / Block"
          value={`${flat.floor != null ? `Floor ${flat.floor}` : "—"}${flat.block ? ` · ${flat.block}` : ""}`}
        />
        <StatCard
          label="Size"
          value={flat.size_sqft ? `${flat.size_sqft} sqft` : "—"}
        />
        <StatCard
          label="Monthly fee"
          value={
            flat.monthly_fee != null
              ? formatCurrency(Number(flat.monthly_fee))
              : "Building default"
          }
        />
        <StatCard
          label="Outstanding"
          tone={Number(flat.outstanding_dues ?? 0) > 0 ? "danger" : "success"}
          value={formatLakh(Number(flat.outstanding_dues ?? 0))}
        />
      </div>

      {(openCredits > 0 || thisMonth || paidThrough) && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {paidThrough && (
            <StatCard
              label="Paid through"
              tone="success"
              value={formatMonthLabel(paidThrough.slice(0, 7))}
              sub="Every month up to here is settled."
            />
          )}
          {thisMonth && (
            <StatCard
              label="This month"
              value={
                <InvoiceStatusPill
                  status={thisMonth.status ?? "pending"}
                  amount={Number(thisMonth.amount)}
                  paidTotal={thisMonthPaid}
                  due_date={thisMonth.due_date}
                />
              }
            />
          )}
          {openCredits > 0 && (
            <StatCard
              label="Advance held"
              tone="success"
              value={formatCurrency(openCredits)}
              sub="Paid already, waiting for the next bill."
            />
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm">Residents</h3>
        {residents?.length ? (
          <div className="divide-y divide-border">
            {residents.map((r) => (
              <div key={r.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {r.full_name}{" "}
                    {r.is_primary && <span className="text-xs text-primary">★ primary</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    <span className="capitalize">{r.relationship}</span>
                    {r.phone ? ` · ${formatPhone(r.phone)}` : ""}
                    {r.move_in_date ? ` · since ${formatDate(r.move_in_date)}` : ""}
                  </div>
                </div>
                <Link
                  href={`/admin/residents/${r.id}`}
                  className="text-sm text-primary hover:underline shrink-0"
                >
                  Open
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No residents linked yet.</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm">Last 12 Invoices</h3>
        {invoiceRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Invoice #</th>
                  <th className="py-2 pr-3">Month</th>
                  <th className="py-2 pr-3">Due date</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3 text-right">Paid</th>
                  <th className="py-2 pr-3 text-right">Due (balance)</th>
                  <th className="py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoiceRows.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{inv.invoiceNumber}</td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{formatDate(inv.month)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{inv.due ? formatDate(inv.due) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(inv.amount)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{formatCurrency(inv.paid)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {inv.balance > 0 ? (
                        <span className="font-semibold text-destructive">{formatCurrency(inv.balance)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 rounded-full text-xs font-medium",
                          inv.status === "Cleared" && "status-paid",
                          inv.status === "Waived" && "status-waived",
                          inv.status === "Due" && "status-overdue",
                        )}
                      >
                        {inv.status === "Cleared" ? "Cleared ✓" : inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm">Payment history</h3>
        {paymentRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Receipt #</th>
                  <th className="py-2 pr-3">Mode</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((p, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{p.date ? formatDate(p.date) : "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{p.receipt || "—"}</td>
                    <td className="py-2 pr-3 capitalize">{p.mode}</td>
                    <td className="py-2 pr-3 capitalize">{p.category}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatCurrency(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No payments recorded.</p>
        )}
      </div>

      {flat.notes && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 text-sm">Notes</h3>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{flat.notes}</p>
        </div>
      )}
    </div>
  );
}
