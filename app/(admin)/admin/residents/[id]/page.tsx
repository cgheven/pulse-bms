import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatCNIC, formatDate, formatPhone, formatReceiptNo } from "@/lib/utils";
import { ArrowLeft, Car, FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResidentFormDialog } from "@/components/admin/residents/resident-form-dialog";
import { KpiRowSkeleton, TableSkeleton } from "@/components/layout/table-skeleton";
import { DocumentsClient, type DocumentRow } from "@/components/admin/residents/documents-client";

export const dynamic = "force-dynamic";

export default async function ResidentDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  return (
    <div className="space-y-5 animate-fade-up">
      {/* Sticky back-link header — renders instantly with no data wait */}
      <div className="flex items-center gap-2">
        <Link
          href="/admin/residents"
          prefetch
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Suspense
          fallback={
            <span className="inline-block h-7 w-40 rounded bg-secondary/50 animate-pulse" />
          }
        >
          <ResidentName id={id} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Suspense fallback={<KpiRowSkeleton count={2} />}>
          <DetailsCard id={id} />
        </Suspense>
        <Suspense fallback={<TableSkeleton rows={5} />}>
          <PaymentsCard id={id} />
        </Suspense>
      </div>
      <Suspense fallback={<TableSkeleton rows={3} />}>
        <VehiclesCard id={id} />
      </Suspense>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Documents
        </h2>
        <Suspense fallback={<TableSkeleton rows={2} />}>
          <DocumentsCard id={id} />
        </Suspense>
      </section>
    </div>
  );
}

/* Streams the title + edit button — fetches just the resident row + flats list */
async function ResidentName({ id }: { id: string }) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) notFound();
  const supabase = await createClient();

  const [{ data: r }, { data: flats }, { data: building }] = await Promise.all([
    supabase
      .from("bms_residents")
      .select("*")
      .eq("id", id)
      .eq("building_id", buildingId)
      .single(),
    supabase
      .from("bms_flats")
      .select("id, flat_number")
      .eq("building_id", buildingId)
      .order("flat_number"),
    supabase
      .from("bms_buildings")
      .select("entry_fee_owner, entry_fee_tenant")
      .eq("id", buildingId)
      .single(),
  ]);
  if (!r) notFound();

  return (
    <>
      <h1>{r.full_name}</h1>
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
          <Button variant="outline" size="sm" className="ml-auto h-8">
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Button>
        }
      />
    </>
  );
}

async function DetailsCard({ id }: { id: string }) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) notFound();
  const supabase = await createClient();

  const { data: r } = await supabase
    .from("bms_residents")
    .select(
      "id, flat_id, full_name, phone, email, cnic, relationship, move_in_date, move_out_date, entry_fee_paid, profile_id",
    )
    .eq("id", id)
    .eq("building_id", buildingId)
    .single();
  if (!r) notFound();

  const { data: flat } = await supabase
    .from("bms_flats")
    .select("id, flat_number")
    .eq("id", r.flat_id)
    .maybeSingle();

  return (
    <div className="card-soft">
      <h3 className="mb-1">Details</h3>
      <dl className="divide-y divide-border/60">
        <Detail
          label="Flat"
          value={
            flat?.flat_number ? (
              <Link
                href={`/admin/flats/${flat.id}`}
                prefetch
                className="text-primary hover:underline"
              >
                {flat.flat_number}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <Detail label="Relationship" value={<span className="capitalize">{r.relationship}</span>} />
        <Detail label="Phone" value={r.phone ? formatPhone(r.phone) : "—"} />
        <Detail label="Email" value={r.email ?? "—"} />
        <Detail label="CNIC" value={r.cnic ? formatCNIC(r.cnic) : "—"} />
        <Detail
          label="Move-in"
          value={r.move_in_date ? formatDate(r.move_in_date) : "—"}
        />
        <Detail
          label="Move-out"
          value={r.move_out_date ? formatDate(r.move_out_date) : "—"}
        />
        <Detail
          label="Entry fee paid"
          value={formatCurrency(Number(r.entry_fee_paid ?? 0))}
        />
        <Detail
          label="Portal user"
          value={r.profile_id ? "Linked" : "Not invited"}
        />
      </dl>
    </div>
  );
}

async function PaymentsCard({ id }: { id: string }) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) notFound();
  const supabase = await createClient();

  const { data: payments } = await supabase
    .from("bms_payments")
    .select("id, payment_date, amount, payment_mode, category, receipt_no")
    .eq("resident_id", id)
    .order("payment_date", { ascending: false })
    .limit(20);

  return (
    <div className="card-soft">
      <h3 className="mb-3">Recent payments</h3>
      {payments?.length ? (
        <>
          {/* Mobile — compact rows (the table is too wide for a phone) */}
          <div className="space-y-2 sm:hidden">
            {payments.map((p) => {
              const receipt = formatReceiptNo(p.receipt_no as number | null);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">
                      {p.payment_date ? formatDate(p.payment_date) : "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground capitalize">
                      {p.category}
                      {receipt && (
                        <>
                          <span className="mx-1 text-muted-foreground/40">·</span>
                          <span className="font-mono normal-case">#{receipt}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(Number(p.amount))}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
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
                    <td className="py-2 whitespace-nowrap">
                      {p.payment_date ? formatDate(p.payment_date) : "—"}
                    </td>
                    <td className="py-2 font-mono text-xs">{formatReceiptNo(p.receipt_no as number | null) || "—"}</td>
                    <td className="py-2 capitalize">{p.category}</td>
                    <td className="py-2 text-right font-semibold">
                      {formatCurrency(Number(p.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">No payments recorded.</p>
      )}
    </div>
  );
}

async function VehiclesCard({ id }: { id: string }) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) notFound();
  const supabase = await createClient();

  const { data: vehicles } = await supabase
    .from("bms_vehicles")
    .select("id, plate_number, vehicle_type, make, model, color, is_primary, notes")
    .eq("resident_id", id)
    .eq("building_id", buildingId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="card-soft">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2">
          <Car className="w-4 h-4 text-muted-foreground" />
          Vehicles
        </h3>
        <Link
          href="/admin/vehicles"
          prefetch
          className="text-sm text-primary hover:underline"
        >
          Manage
        </Link>
      </div>
      {vehicles?.length ? (
        <>
          {/* Mobile — one card per vehicle */}
          <div className="space-y-2 sm:hidden">
            {vehicles.map((v) => {
              const makeModel = [v.make, v.model].filter(Boolean).join(" ");
              const sub = [
                v.vehicle_type,
                makeModel || null,
                v.color ?? null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div
                  key={v.id}
                  className="rounded-lg border border-border bg-background/40 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{v.plate_number}</span>
                    {v.is_primary && (
                      <span className="shrink-0 rounded-full border border-warning/30 bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground capitalize">{sub || "—"}</p>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2">Plate</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Make / Model</th>
                  <th className="py-2">Color</th>
                  <th className="py-2">Primary</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="py-2 font-mono whitespace-nowrap">{v.plate_number}</td>
                    <td className="py-2 capitalize">{v.vehicle_type}</td>
                    <td className="py-2">
                      {[v.make, v.model].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="py-2 capitalize">{v.color ?? "—"}</td>
                    <td className="py-2">
                      {v.is_primary ? (
                        <span className="rounded-full border border-warning/30 bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
                          Primary
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">No vehicles registered.</p>
      )}
    </div>
  );
}

async function DocumentsCard({ id }: { id: string }) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  void profile;
  const buildingId = await getActiveBuilding();
  if (!buildingId) notFound();

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("bms_resident_documents")
    .select("id, doc_type, label, file_name, file_size, mime_type, created_at")
    .eq("resident_id", id)
    .eq("building_id", buildingId)
    .order("created_at", { ascending: false });

  const docs: DocumentRow[] = (rows ?? []).map((r) => ({
    id:         r.id,
    doc_type:   r.doc_type,
    label:      r.label,
    file_name:  r.file_name,
    file_size:  r.file_size,
    mime_type:  r.mime_type,
    created_at: r.created_at,
    href:       `/api/docs/${r.id}`,
  }));

  return <DocumentsClient residentId={id} docs={docs} />;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-foreground break-words">
        {value}
      </dd>
    </div>
  );
}
