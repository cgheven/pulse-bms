import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatCNIC, formatDate, formatPhone } from "@/lib/utils";
import { ArrowLeft, Pencil, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResidentFormDialog } from "@/components/admin/residents/resident-form-dialog";

export const dynamic = "force-dynamic";

export default async function ResidentDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) notFound();
  const supabase = await createClient();

  const { data: r } = await supabase
    .from("bms_residents")
    .select("*")
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .single();
  if (!r) notFound();

  const [{ data: flat }, { data: flats }, { data: building }, { data: payments }] = await Promise.all([
    supabase.from("bms_flats").select("id, flat_number").eq("id", r.flat_id).single(),
    supabase
      .from("bms_flats")
      .select("id, flat_number")
      .eq("building_id", profile.building_id)
      .order("flat_number"),
    supabase
      .from("bms_buildings")
      .select("entry_fee_owner, entry_fee_tenant")
      .eq("id", profile.building_id)
      .single(),
    supabase
      .from("bms_payments")
      .select("id, payment_date, amount, payment_mode, category, receipt_no")
      .eq("resident_id", id)
      .order("payment_date", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/admin/residents" className="text-muted-foreground hover:text-foreground shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1>{r.full_name}</h1>
          {r.is_primary && <Star className="w-5 h-5 text-warning fill-warning shrink-0" />}
        </div>
        <ResidentFormDialog
          initial={{
            id: r.id,
            flat_id: r.flat_id,
            full_name: r.full_name,
            phone: r.phone,
            email: r.email,
            cnic: r.cnic,
            relationship: r.relationship,
            is_primary: r.is_primary,
            move_in_date: r.move_in_date,
            move_out_date: r.move_out_date,
            entry_fee_paid: Number(r.entry_fee_paid ?? 0),
            is_active: r.is_active,
          }}
          flats={(flats ?? []).map((f) => ({ id: f.id, flat_number: f.flat_number }))}
          buildingDefaults={{
            entry_fee_owner: Number(building?.entry_fee_owner ?? 10000),
            entry_fee_tenant: Number(building?.entry_fee_tenant ?? 5000),
          }}
          trigger={
            <Button variant="outline">
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-soft space-y-3">
          <h3>Details</h3>
          <Detail label="Flat" value={flat?.flat_number ? <Link href={`/admin/flats/${flat.id}`} className="text-primary hover:underline">{flat.flat_number}</Link> : "—"} />
          <Detail label="Relationship" value={r.relationship} />
          <Detail label="Phone" value={r.phone ? formatPhone(r.phone) : "—"} />
          <Detail label="Email" value={r.email ?? "—"} />
          <Detail label="CNIC" value={r.cnic ? formatCNIC(r.cnic) : "—"} />
          <Detail label="Move-in" value={r.move_in_date ? formatDate(r.move_in_date) : "—"} />
          <Detail label="Move-out" value={r.move_out_date ? formatDate(r.move_out_date) : "—"} />
          <Detail label="Entry fee paid" value={formatCurrency(Number(r.entry_fee_paid ?? 0))} />
          <Detail
            label="Portal user"
            value={r.profile_id ? "Linked" : "Not invited"}
          />
        </div>
        <div className="card-soft">
          <h3 className="mb-3">Recent payments</h3>
          {payments?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="py-2">Date</th>
                    <th className="py-2">Receipt</th>
                    <th className="py-2">Category</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="py-2">{p.payment_date ? formatDate(p.payment_date) : "—"}</td>
                      <td className="py-2 font-mono text-xs">{p.receipt_no}</td>
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
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
