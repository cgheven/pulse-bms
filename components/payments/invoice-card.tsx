import { amountInWords } from "@/lib/amount-in-words";
import { formatCurrency, formatDate, formatMonthLabel, formatPhone } from "@/lib/utils";

/**
 * Invoice document — clean, monochrome, rule-separated bill in the Pulse
 * paper style (centred building header, label/value rows, bold TOTAL DUE,
 * amount in words, footer). Black-on-white so the on-screen preview and the
 * printed/saved copy are identical. Shown inside the Preview Invoice dialog
 * and printed via the `#print-area` print system.
 */
export type InvoiceCardProps = {
  building: {
    name: string;
    address: string | null;
    city: string | null;
    phone: string | null;
  };
  invoice: {
    invoice_number: string;
    /** YYYY-MM-DD billing month. */
    billing_month: string;
    due_date: string | null;
    amount: number;
    paid: number;
  };
  flat: { flat_number: string; floor: number | null; block: string | null };
  resident: { name: string | null; phone: string | null };
};

export function InvoiceCard({ building, invoice, flat, resident }: InvoiceCardProps) {
  const amount = Number(invoice.amount);
  const paid = Number(invoice.paid);
  const balance = Math.max(0, amount - paid);
  const settled = balance <= 0;
  const month = formatMonthLabel(String(invoice.billing_month).slice(0, 7));
  const dueStr = invoice.due_date ? formatDate(invoice.due_date) : "—";
  const words = amountInWords(settled ? amount : balance);
  const addrLine = [building.address, building.city].filter(Boolean).join(", ");
  const location = [
    flat.floor != null ? `Floor ${flat.floor}` : null,
    flat.block ? `Block ${flat.block}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const Rule = () => <div className="my-3 border-t border-black" />;
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-baseline justify-between gap-4">
      <span>{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );

  return (
    <div
      className="w-full bg-white px-7 py-8 text-black"
      style={{
        fontFamily: "Arial, Helvetica, system-ui, sans-serif",
        fontSize: "14px",
        lineHeight: 1.5,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold uppercase leading-tight tracking-tight">
          {building.name}
        </h1>
        {addrLine && <p className="mt-2">{addrLine}</p>}
        {building.phone && <p>Tel: {building.phone}</p>}
      </div>

      <Rule />
      <h2 className="text-center text-xl font-bold tracking-wide">Maintenance Invoice</h2>
      <Rule />

      {/* Meta */}
      <div className="space-y-1.5">
        <Row label="Invoice #" value={invoice.invoice_number} />
        <Row label="Period" value={month} />
        <Row label="Due Date" value={dueStr} />
        <Row label="Status" value={settled ? "Paid" : paid > 0 ? "Partial" : "Unpaid"} />
      </div>

      <Rule />

      {/* Bill to */}
      <div>
        <p className="font-bold">Bill To:</p>
        <p>
          Apartment {flat.flat_number}
          {location ? ` · ${location}` : ""}
        </p>
        {resident.name && <p>{resident.name}</p>}
        {resident.phone && <p>Phone: {formatPhone(resident.phone)}</p>}
      </div>

      <Rule />

      {/* Breakdown */}
      <div>
        <p className="font-bold">Breakdown:</p>
        <Row label={`Maintenance charge — ${month}`} value={formatCurrency(amount)} />
        {paid > 0 && <Row label="Received" value={`− ${formatCurrency(paid)}`} />}
      </div>

      <Rule />

      {/* Total */}
      <div className="flex items-baseline justify-between gap-4 text-lg font-bold">
        <span>{settled ? "TOTAL PAID" : "TOTAL DUE"}</span>
        <span>{formatCurrency(settled ? amount : balance)}</span>
      </div>

      <Rule />

      <p>
        <span className="font-bold">In Words:</span> {words}
      </p>

      <Rule />

      <p className="text-center">
        {settled
          ? "Thank you — this invoice has been settled."
          : `Please clear the balance of ${formatCurrency(balance)} by ${dueStr}.`}
      </p>

      <Rule />

      <p className="text-center text-sm">Powered by yourpulse.io</p>
    </div>
  );
}
