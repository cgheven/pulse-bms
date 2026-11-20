import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getInvoiceDocument } from "@/app/actions/billing";
import { InvoiceCard } from "@/components/payments/invoice-card";
import { PrintReceiptButton } from "@/components/payments/print-receipt-button";

export const dynamic = "force-dynamic";

/**
 * Full-page printable maintenance invoice — the "Open in new tab" target of
 * the Preview Invoice dialog. The dialog is the primary view; this page is for
 * printing / sharing a direct link. Building-scoped via getInvoiceDocument.
 */
export default async function InvoicePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin", "super_admin"]);
  const data = await getInvoiceDocument(id);
  if (!data) notFound();

  return (
    <div className="min-h-screen bg-secondary/30 py-8">
      <div className="mx-auto max-w-[520px] px-4">
        <div className="no-print mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Invoice {data.invoice.invoice_number}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {data.building.name} · {data.flat.flat_number}
            </p>
          </div>
          <PrintReceiptButton />
        </div>

        <div id="print-area" className="overflow-hidden rounded-md bg-white shadow-lg">
          <InvoiceCard {...data} />
        </div>
      </div>
    </div>
  );
}
