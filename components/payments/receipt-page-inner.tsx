import { ReceiptCard, type ReceiptCardProps } from "@/components/payments/receipt-card";
import { DownloadReceiptPdfButton } from "@/components/payments/download-receipt-pdf";
import { PrintReceiptButton } from "@/components/payments/print-receipt-button";
import { formatReceiptNo } from "@/lib/utils";

/**
 * Server-rendered receipt page used by the admin / union / resident
 * routes. The role-scoped page wraps this with the appropriate
 * `requireRole(...)` guard and cross-tenant load, then passes the
 * resolved receipt data here for rendering.
 *
 * The toolbar (Print + Download) lives ABOVE the receipt and carries
 * the `print-hidden` class so it's suppressed in the print preview.
 */
export function ReceiptPageInner({
  receipt,
  showLegacyReference = false,
}: {
  receipt: ReceiptCardProps;
  /**
   * When true, render the small "Legacy reference: …" line on the
   * receipt card. Admin + union pass true; the resident page omits
   * it so paper-book IDs don't confuse end users.
   */
  showLegacyReference?: boolean;
}) {
  const filename = `receipt_${formatReceiptNo(receipt.payment.receipt_no)}.pdf`;
  return (
    <div className="min-h-screen bg-secondary/30 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="print-hidden mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">
              Receipt #{formatReceiptNo(receipt.payment.receipt_no)}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {receipt.building.name} · {receipt.flat.flat_number}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintReceiptButton />
            <DownloadReceiptPdfButton receipt={receipt} filename={filename} />
          </div>
        </div>

        <div className="rounded-xl shadow-lg overflow-hidden">
          <ReceiptCard {...receipt} showLegacyReference={showLegacyReference} />
        </div>
      </div>
    </div>
  );
}
