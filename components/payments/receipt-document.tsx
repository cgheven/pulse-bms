import { amountInWords } from "@/lib/amount-in-words";
import { formatCurrency, formatDate, formatReceiptNo } from "@/lib/utils";
import { paymentReferenceLabel } from "@/lib/payment-reference";
import type { ReceiptCardProps } from "@/components/payments/receipt-card";

/**
 * Receipt document — the clean, monochrome, rule-separated paper style shared
 * with the Maintenance invoice (centred building header, label/value rows,
 * bold TOTAL PAID, amount in words, footer). Black-on-white so the on-screen
 * preview and the printed/saved copy are identical. Shown inside the receipt
 * preview dialog and printed via the `#print-area` print system.
 *
 * Reuses `ReceiptCardProps` (same loader as the old colour card) so the only
 * thing that changes between old and new is the presentation.
 */
const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  bank_transfer: "Bank",
  online: "Online",
  cheque: "Cheque",
  credit_carryforward: "Credit (from earlier payment)",
};

function methodLabel(raw: string): string {
  return METHOD_LABEL[raw.toLowerCase()] ?? raw;
}

export function ReceiptDocument({
  building,
  payment,
  flat,
  resident,
  lines,
  showLegacyReference = false,
}: ReceiptCardProps) {
  const receiptNo = formatReceiptNo(payment.receipt_no);
  const dateStr = formatDate(payment.payment_date);
  const words = amountInWords(payment.amount);
  const addrLine = [building.address, building.city].filter(Boolean).join(", ");
  const refLabel = paymentReferenceLabel(payment.method);
  const rows =
    lines && lines.length > 0
      ? lines
      : [{ purpose: "Maintenance", period: null, amount: payment.amount }];
  const signer = payment.received_by_name;
  const signerRole = payment.received_by_position;

  const Rule = () => <div className="my-2.5 border-t border-black" />;
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-baseline justify-between gap-4">
      <span>{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );

  return (
    <div
      className="w-full bg-white px-6 py-6 text-black"
      style={{
        fontFamily: "Arial, Helvetica, system-ui, sans-serif",
        fontSize: "14px",
        lineHeight: 1.5,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* Header — divs (not h1/h2) so they keep the document's Arial font
          instead of the app's global serif heading face. */}
      <div className="text-center">
        <div className="text-2xl font-bold uppercase leading-tight tracking-tight">
          {building.name}
        </div>
        {addrLine && <p className="mt-2">{addrLine}</p>}
        {building.phone && <p>Tel: {building.phone}</p>}
      </div>

      <Rule />
      <div className="text-center text-xl font-bold tracking-wide">Payment Receipt</div>
      <Rule />

      {/* Meta */}
      <div>
        <Row label="Receipt #" value={receiptNo} />
        <Row label="Date" value={dateStr} />
        <Row label="Method" value={methodLabel(payment.method)} />
        {payment.reference && <Row label={refLabel} value={payment.reference} />}
      </div>

      <Rule />

      {/* Received from */}
      <div>
        <p className="font-bold">Received From:</p>
        <p>Apartment {flat.flat_number}</p>
        {resident.name && resident.name !== "—" && <p>{resident.name}</p>}
      </div>

      <Rule />

      {/* Breakdown — one line per month the money settled. */}
      <div>
        <p className="font-bold">Payment For:</p>
        {rows.map((line, i) => (
          <Row
            key={`${line.period ?? "none"}-${i}`}
            label={line.period ? `${line.purpose} · ${line.period}` : line.purpose}
            value={formatCurrency(line.amount)}
          />
        ))}
      </div>

      <Rule />

      {/* Total */}
      <div className="flex items-baseline justify-between gap-4 text-lg font-bold">
        <span>TOTAL PAID</span>
        <span>{formatCurrency(payment.amount)}</span>
      </div>

      <Rule />

      <p>
        <span className="font-bold">In Words:</span> {words}
      </p>

      <Rule />

      <div className="text-center">
        <p>Thank you — payment received.</p>
        {signer && (
          <p className="mt-1">
            Received by: <span className="font-medium">{signer}</span>
            {signerRole ? ` · ${signerRole}` : ""}
          </p>
        )}
      </div>

      {showLegacyReference && payment.legacy_receipt_no && (
        <>
          <Rule />
          <p className="text-center text-sm">
            Legacy reference: {payment.legacy_receipt_no}
          </p>
        </>
      )}

      <Rule />

      <p className="text-center text-sm">Powered by yourpulse.io</p>
    </div>
  );
}
