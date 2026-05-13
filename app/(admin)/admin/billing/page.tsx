import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GenerateInvoicesButton } from "@/components/admin/billing/generate-invoices-button";
import { InvoicesList, type InvoiceRow } from "@/components/admin/billing/invoices-list";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Billing</h1>
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  const supabase = await createClient();

  const [{ data: invoices }, { data: flats }, { data: building }] = await Promise.all([
    supabase
      .from("bms_invoices")
      .select("id, invoice_number, flat_id, billing_month, amount, status, due_date")
      .eq("building_id", profile.building_id)
      .order("billing_month", { ascending: false })
      .order("invoice_number", { ascending: false })
      .limit(500),
    supabase
      .from("bms_flats")
      .select("id, flat_number, outstanding_dues")
      .eq("building_id", profile.building_id)
      .order("flat_number"),
    supabase
      .from("bms_buildings")
      .select("name")
      .eq("id", profile.building_id)
      .single(),
  ]);

  // paid totals
  const invIds = (invoices ?? []).map((i) => i.id);
  const paidMap = new Map<string, number>();
  if (invIds.length) {
    const { data: pays } = await supabase
      .from("bms_payments")
      .select("invoice_id, amount")
      .in("invoice_id", invIds);
    for (const p of pays ?? []) {
      if (!p.invoice_id) continue;
      paidMap.set(p.invoice_id, (paidMap.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0));
    }
  }

  const flatMap = new Map((flats ?? []).map((f) => [f.id, f.flat_number]));

  // Primary-resident name per flat for the combined Flat cell
  const { data: primaries } = await supabase
    .from("bms_residents")
    .select("flat_id, full_name")
    .eq("building_id", profile.building_id)
    .eq("is_active", true)
    .eq("is_primary", true);
  const primaryByFlat = new Map((primaries ?? []).map((r) => [r.flat_id, r.full_name]));

  const rows: InvoiceRow[] = (invoices ?? []).map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    flat_id: inv.flat_id,
    flat_number: flatMap.get(inv.flat_id) ?? "—",
    resident_name: primaryByFlat.get(inv.flat_id) ?? null,
    billing_month: inv.billing_month,
    amount: Number(inv.amount),
    status: inv.status ?? "pending",
    due_date: inv.due_date,
    paid_total: paidMap.get(inv.id) ?? 0,
  }));

  // KPIs
  const today = new Date().toISOString().slice(0, 10);
  const ym = today.slice(0, 7);
  const thisMonthRows = rows.filter((r) => r.billing_month.slice(0, 7) === ym);
  const monthTotal = thisMonthRows.reduce((s, r) => s + r.amount, 0);
  const monthCollected = thisMonthRows.reduce((s, r) => s + r.paid_total, 0);
  const monthPending = thisMonthRows.filter((r) => r.status === "pending" && (!r.due_date || r.due_date >= today)).length;
  const monthOverdue = thisMonthRows.filter((r) => r.status === "pending" && r.due_date && r.due_date < today).length;
  const monthPaid = thisMonthRows.filter((r) => r.status === "paid").length;

  const defaultMonth = ym;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1>Billing</h1>
          <p className="text-muted-foreground">Maintenance invoices for {ym}.</p>
        </div>
        <div className="shrink-0">
          <GenerateInvoicesButton defaultMonth={defaultMonth} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi label="This month total" value={formatCurrency(monthTotal)} />
        <Kpi label="Collected" value={formatCurrency(monthCollected)} accent="success" />
        <Kpi label="Paid" value={String(monthPaid)} />
        <Kpi label="Pending" value={String(monthPending)} accent="warning" />
        <Kpi label="Overdue" value={String(monthOverdue)} accent="destructive" />
      </div>

      <InvoicesList
        invoices={rows}
        buildingName={building?.name ?? "Building"}
        flatPickerOptions={(flats ?? []).map((f) => ({
          id: f.id,
          flat_number: f.flat_number,
          outstanding_dues: Number(f.outstanding_dues ?? 0),
        }))}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "warning" | "destructive";
}) {
  const accentCls =
    accent === "success"
      ? "text-[hsl(151_70%_28%)]"
      : accent === "warning"
      ? "text-[hsl(38_95%_35%)]"
      : accent === "destructive"
      ? "text-destructive"
      : "";
  return (
    <div className="card-soft">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accentCls}`}>{value}</div>
    </div>
  );
}
