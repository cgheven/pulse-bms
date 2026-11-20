import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { createClient } from "@/lib/supabase/server";
import { formatMonthLabel } from "@/lib/utils";
import { InvoiceCard } from "@/components/payments/invoice-card";
import { PrintReceiptButton } from "@/components/payments/print-receipt-button";

export const dynamic = "force-dynamic";

/**
 * Admin-scoped printable maintenance invoice (the bill). Opened in a new tab
 * from the "Preview Invoice" row action. Scoped to the caller's building so a
 * cross-tenant id probe 404s. Renders InvoiceCard — the bill counterpart of
 * the receipt document — with Print / Save-as-PDF (the `#print-area` +
 * `.no-print` print system from globals.css).
 */
export default async function InvoicePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) notFound();
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("bms_invoices")
    .select("id, invoice_number, billing_month, amount, due_date, flat_id")
    .eq("id", id)
    .eq("building_id", buildingId)
    .single();
  if (!invoice) notFound();

  const [{ data: building }, { data: flat }, { data: payments }] = await Promise.all([
    supabase
      .from("bms_buildings")
      .select("name, address, city, public_whatsapp")
      .eq("id", buildingId)
      .single(),
    supabase
      .from("bms_flats")
      .select("flat_number, floor, block")
      .eq("id", invoice.flat_id)
      .single(),
    supabase.from("bms_payments").select("amount").eq("invoice_id", id),
  ]);

  const { data: resident } = await supabase
    .from("bms_residents")
    .select("full_name, phone")
    .eq("flat_id", invoice.flat_id)
    .eq("building_id", buildingId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  const paid = (payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);

  return (
    <div className="min-h-screen bg-secondary/30 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="no-print mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Invoice {invoice.invoice_number}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {building?.name ?? "Building"} · {flat?.flat_number ?? "—"} ·{" "}
              {formatMonthLabel(String(invoice.billing_month).slice(0, 7))}
            </p>
          </div>
          <PrintReceiptButton />
        </div>

        <div id="print-area" className="rounded-xl shadow-lg overflow-hidden">
          <InvoiceCard
            building={{
              name: building?.name ?? "Building",
              address: building?.address ?? null,
              city: building?.city ?? null,
              phone: (building as { public_whatsapp?: string | null } | null)?.public_whatsapp ?? null,
            }}
            invoice={{
              invoice_number: invoice.invoice_number,
              billing_month: invoice.billing_month,
              due_date: invoice.due_date,
              amount: Number(invoice.amount),
              paid,
            }}
            flat={{
              flat_number: flat?.flat_number ?? "—",
              floor: flat?.floor ?? null,
              block: flat?.block ?? null,
            }}
            resident={{
              name: resident?.full_name ?? null,
              phone: resident?.phone ?? null,
            }}
          />
        </div>
      </div>
    </div>
  );
}
