import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatLakh, formatPhone } from "@/lib/utils";
import { ArrowLeft, Pencil } from "lucide-react";
import { FlatFormDialog } from "@/components/admin/flats/flat-form-dialog";
import { Button } from "@/components/ui/button";
import { InvoiceStatusPill } from "@/components/admin/billing/invoice-status-pill";

export const dynamic = "force-dynamic";

export default async function FlatDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) notFound();
  const supabase = await createClient();

  const { data: flat } = await supabase
    .from("bms_flats")
    .select("*")
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .single();
  if (!flat) notFound();

  const [{ data: residents }, { data: invoices }, { data: payments }] = await Promise.all([
    supabase
      .from("bms_residents")
      .select("id, full_name, phone, cnic, relationship, is_primary, is_active, move_in_date, entry_fee_paid")
      .eq("flat_id", id)
      .eq("building_id", profile.building_id)
      .order("is_primary", { ascending: false })
      .order("full_name"),
    supabase
      .from("bms_invoices")
      .select("id, invoice_number, billing_month, amount, status, due_date")
      .eq("flat_id", id)
      .eq("building_id", profile.building_id)
      .order("billing_month", { ascending: false })
      .limit(12),
    supabase
      .from("bms_payments")
      .select("id, payment_date, amount, payment_mode, category, receipt_no, invoice_id")
      .eq("flat_id", id)
      .eq("building_id", profile.building_id)
      .order("payment_date", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/flats" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1>Flat {flat.flat_number}</h1>
          <span className="status-info inline-flex px-2.5 py-1 rounded-full text-sm font-medium">
            {flat.ownership_type}
          </span>
        </div>
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Floor / Block</div>
          <div className="mt-1 text-xl font-semibold">
            {flat.floor != null ? `Floor ${flat.floor}` : "—"}
            {flat.block ? ` · ${flat.block}` : ""}
          </div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Size</div>
          <div className="mt-1 text-xl font-semibold">
            {flat.size_sqft ? `${flat.size_sqft} sqft` : "—"}
          </div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Monthly fee</div>
          <div className="mt-1 text-xl font-semibold">
            {flat.monthly_fee != null ? formatCurrency(Number(flat.monthly_fee)) : "Building default"}
          </div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Outstanding</div>
          <div className={`mt-1 text-xl font-semibold ${Number(flat.outstanding_dues ?? 0) > 0 ? "text-destructive" : ""}`}>
            {formatLakh(Number(flat.outstanding_dues ?? 0))}
          </div>
        </div>
      </div>

      <div className="card-soft">
        <h3 className="mb-3">Residents</h3>
        {residents?.length ? (
          <div className="divide-y divide-border">
            {residents.map((r) => (
              <div key={r.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold">
                    {r.full_name}{" "}
                    {r.is_primary && <span className="text-xs text-primary">★ primary</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {r.relationship}
                    {r.phone ? ` · ${formatPhone(r.phone)}` : ""}
                    {r.move_in_date ? ` · since ${formatDate(r.move_in_date)}` : ""}
                  </div>
                </div>
                <Link
                  href={`/admin/residents/${r.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  Open
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No residents linked yet.</p>
        )}
      </div>

      <div className="card-soft">
        <h3 className="mb-3">Last 12 Invoices</h3>
        {invoices?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2">Invoice #</th>
                  <th className="py-2">Month</th>
                  <th className="py-2">Due</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-0">
                    <td className="py-2 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="py-2">{formatDate(inv.billing_month)}</td>
                    <td className="py-2">{inv.due_date ? formatDate(inv.due_date) : "—"}</td>
                    <td className="py-2 text-right">{formatCurrency(Number(inv.amount))}</td>
                    <td className="py-2">
                      <InvoiceStatusPill status={inv.status ?? "pending"} due_date={inv.due_date} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground">No invoices yet.</p>
        )}
      </div>

      <div className="card-soft">
        <h3 className="mb-3">Payment history</h3>
        {payments?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2">Date</th>
                  <th className="py-2">Receipt #</th>
                  <th className="py-2">Mode</th>
                  <th className="py-2">Category</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="py-2">{p.payment_date ? formatDate(p.payment_date) : "—"}</td>
                    <td className="py-2 font-mono text-xs">{p.receipt_no}</td>
                    <td className="py-2">{p.payment_mode}</td>
                    <td className="py-2">{p.category}</td>
                    <td className="py-2 text-right font-semibold">{formatCurrency(Number(p.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground">No payments recorded.</p>
        )}
      </div>

      {flat.notes && (
        <div className="card-soft">
          <h3 className="mb-2">Notes</h3>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{flat.notes}</p>
        </div>
      )}
    </div>
  );
}
