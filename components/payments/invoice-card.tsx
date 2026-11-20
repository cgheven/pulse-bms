import { amountInWords } from "@/lib/amount-in-words";
import { formatCurrency } from "@/lib/utils";

/**
 * Invoice card — the bill counterpart to ReceiptCard, built on the exact same
 * premium A5 document design (brand stripe, header + status card, two-column
 * meta, description table, double-rule TOTAL band, amount in words, footer) so
 * a building's invoices and receipts read as one consistent document family.
 *
 * Where the receipt says PAID, the invoice shows the live status (Unpaid /
 * Partial / Paid) and a Balance Due total. Printed white-on-white A5 so the
 * on-screen preview and the printed/saved PDF are identical.
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

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

function monthLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(d);
}

// Status pill palette, mirroring the receipt's green PAID pill.
const STATUS_STYLE: Record<
  string,
  { bg: string; fg: string; border: string; dot: string }
> = {
  Paid: { bg: "#ECFDF5", fg: "#047857", border: "#A7F3D0", dot: "#10B981" },
  Partial: { bg: "#EFF6FF", fg: "#1D4ED8", border: "#BFDBFE", dot: "#3B82F6" },
  Unpaid: { bg: "#FEF2F2", fg: "#B91C1C", border: "#FECACA", dot: "#EF4444" },
};

export function InvoiceCard({ building, invoice, flat, resident }: InvoiceCardProps) {
  const amount = Number(invoice.amount);
  const paid = Number(invoice.paid);
  const balance = Math.max(0, amount - paid);
  const status = balance <= 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
  const statusStyle = STATUS_STYLE[status];
  const month = monthLabel(invoice.billing_month);
  const dueStr = invoice.due_date ? formatLongDate(invoice.due_date) : "—";
  const words = amountInWords(balance > 0 ? balance : amount);
  const addrLine = [building.address, building.city].filter(Boolean).join(", ");
  const location = [
    flat.floor != null ? `Floor ${flat.floor}` : null,
    flat.block ? `Block ${flat.block}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div
      style={{
        fontSize: "8pt",
        fontWeight: 600,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: "#4B5563",
        borderBottom: "1px solid #D1D5DB",
        paddingBottom: "1.5mm",
        marginBottom: "2.5mm",
        width: "34mm",
      }}
    >
      {children}
    </div>
  );

  return (
    <div
      className="receipt-page mx-auto bg-white text-black"
      style={{
        width: "148mm",
        minHeight: "210mm",
        position: "relative",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",
        fontSize: "10pt",
        lineHeight: 1.5,
        color: "#111827",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* 1. Brand accent stripe */}
      <div style={{ height: "3mm", width: "100%", backgroundColor: "hsl(38, 92%, 55%)" }} />

      <div style={{ padding: "10mm 12mm 12mm 12mm" }}>
        {/* 2. Header row */}
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "8mm",
            marginBottom: "8mm",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontSize: "18pt",
                fontWeight: 700,
                margin: 0,
                letterSpacing: "-0.01em",
                lineHeight: 1.15,
                color: "#0F172A",
              }}
            >
              {building.name}
            </h1>
            {addrLine && (
              <div style={{ fontSize: "9pt", marginTop: "1.5mm", color: "#4B5563", lineHeight: 1.4 }}>
                {addrLine}
              </div>
            )}
            {building.phone && (
              <div style={{ fontSize: "9pt", marginTop: "0.5mm", color: "#4B5563" }}>
                {building.phone}
              </div>
            )}
          </div>

          {/* Invoice-no card (top right) */}
          <div
            style={{
              border: "1px solid #E5E7EB",
              borderRadius: "4mm",
              padding: "3mm 4mm",
              minWidth: "52mm",
              textAlign: "right",
              backgroundColor: "#FAFAFA",
            }}
          >
            <div
              style={{
                fontSize: "7pt",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#4B5563",
              }}
            >
              Maintenance Invoice
            </div>
            <div
              style={{
                fontFamily: "'SF Mono', 'JetBrains Mono', 'Menlo', 'Courier New', monospace",
                fontSize: "11.5pt",
                fontWeight: 600,
                marginTop: "0.5mm",
                color: "#0F172A",
                letterSpacing: "0.02em",
              }}
            >
              {invoice.invoice_number}
            </div>
            <div
              style={{
                marginTop: "2mm",
                display: "inline-flex",
                alignItems: "center",
                gap: "1.5mm",
                backgroundColor: statusStyle.bg,
                color: statusStyle.fg,
                border: `1px solid ${statusStyle.border}`,
                borderRadius: "999px",
                padding: "0.8mm 2.5mm",
                fontSize: "7.5pt",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              <span
                style={{
                  width: "1.6mm",
                  height: "1.6mm",
                  borderRadius: "50%",
                  backgroundColor: statusStyle.dot,
                  display: "inline-block",
                }}
              />
              {status}
            </div>
          </div>
        </header>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #D1D5DB", marginBottom: "6mm" }} />

        {/* 3. Two-column meta */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8mm",
            marginBottom: "8mm",
          }}
        >
          <div>
            <SectionLabel>Bill To</SectionLabel>
            <div style={{ fontSize: "10pt", fontWeight: 600, color: "#0F172A" }}>
              Apartment {flat.flat_number}
            </div>
            {location && (
              <div style={{ fontSize: "9pt", color: "#4B5563", marginTop: "0.4mm" }}>{location}</div>
            )}
            {resident.name && (
              <div style={{ fontSize: "9pt", color: "#374151", marginTop: "0.8mm" }}>
                {resident.name}
              </div>
            )}
            {resident.phone && (
              <div style={{ fontSize: "9pt", color: "#4B5563", marginTop: "0.2mm" }}>
                {resident.phone}
              </div>
            )}
          </div>

          <div>
            <SectionLabel>Invoice Details</SectionLabel>
            <MetaRow label="Billing month" value={month} />
            <MetaRow label="Due date" value={dueStr} />
            <MetaRow label="Status" value={status} />
          </div>
        </div>

        {/* 4. Description table */}
        <div style={{ marginBottom: "6mm" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "8pt",
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#4B5563",
              borderBottom: "1px solid #D1D5DB",
              paddingBottom: "1.5mm",
              marginBottom: "3mm",
            }}
          >
            <span>Description</span>
            <span>Amount</span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "6mm",
              fontSize: "10pt",
            }}
          >
            <div style={{ flex: 1, fontWeight: 600, color: "#0F172A" }}>
              Maintenance charge
              <div style={{ fontSize: "9pt", color: "#4B5563", marginTop: "0.5mm", fontWeight: 400 }}>
                Period: {month}
              </div>
            </div>
            <div
              style={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: 500,
                color: "#0F172A",
                whiteSpace: "nowrap",
              }}
            >
              {formatCurrency(amount)}
            </div>
          </div>
        </div>

        {/* 5. Totals — subtotal + received, then the Balance Due band */}
        <div style={{ marginBottom: "4mm" }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ width: "70mm" }}>
              <SubRow label="Total" value={formatCurrency(amount)} />
              {paid > 0 && <SubRow label="Received" value={`− ${formatCurrency(paid)}`} />}
            </div>
          </div>
          <div
            style={{
              borderTop: "2px solid #0F172A",
              borderBottom: "2px solid #0F172A",
              padding: "3mm 0",
              marginTop: "2mm",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "6mm",
            }}
          >
            <span
              style={{
                fontSize: "10pt",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "#0F172A",
              }}
            >
              Balance Due
            </span>
            <span
              style={{
                fontSize: "20pt",
                fontWeight: 800,
                color: balance > 0 ? "hsl(38, 92%, 42%)" : "#0F172A",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                letterSpacing: "-0.01em",
              }}
            >
              {formatCurrency(balance)}
            </span>
          </div>
        </div>

        {/* 6. Amount in words */}
        <div style={{ fontSize: "9pt", fontStyle: "italic", color: "#4B5563", marginBottom: "16mm" }}>
          Amount in words: {words}
        </div>

        {/* 7. Footer */}
        <div style={{ borderTop: "1px solid #D1D5DB", paddingTop: "3mm" }}>
          <div style={{ fontSize: "7.5pt", color: "#4B5563", lineHeight: 1.5 }}>
            <strong style={{ color: "#374151" }}>Payment</strong>
            {" · "}
            {balance > 0
              ? `Please clear the balance of ${formatCurrency(balance)} by ${dueStr}.`
              : "This invoice has been settled in full. Thank you."}
            {" · "}
            Pay cash at the society office or by bank transfer, then collect your receipt.
          </div>
          <div
            style={{
              fontSize: "7pt",
              color: "#6B7280",
              marginTop: "2mm",
              textAlign: "center",
              letterSpacing: "0.04em",
            }}
          >
            Generated by Pulse BMS · {invoice.invoice_number}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: "2mm", fontSize: "9.5pt", marginBottom: "1.2mm", lineHeight: 1.4 }}>
      <span style={{ color: "#4B5563", minWidth: "24mm" }}>{label}:</span>
      <span style={{ color: "#111827", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function SubRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: "9.5pt",
        color: "#374151",
        marginBottom: "1mm",
      }}
    >
      <span style={{ color: "#4B5563" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
