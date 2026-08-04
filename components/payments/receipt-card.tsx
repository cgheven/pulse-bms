import { amountInWords } from "@/lib/amount-in-words";
import { formatCurrency, formatReceiptNo } from "@/lib/utils";
import { paymentReferenceLabel } from "@/lib/payment-reference";

/**
 * Receipt card — premium SaaS-grade redesign (Stripe / Razorpay style),
 * still printed on A5 portrait paper so the on-screen + PDF + print
 * artefact are pixel-identical.
 *
 * Layout sections (top → bottom):
 *   1. 3mm brand accent stripe (primary color, full-bleed)
 *   2. Header row: building name + address + phone (left)  /
 *                  receipt-no card + PAID pill (right)
 *   3. Two-column meta: BILL TO  /  PAYMENT DETAILS
 *   4. Description table: invoice line + amount (right)
 *   5. Double-rule TOTAL band with the brand-colored amount
 *   6. Amount in words (italic)
 *   7. Signature block (right-aligned, ~30mm below total)
 *   8. Footer terms + brand line
 *
 * The `.receipt-page` wrapper triggers the print CSS in `globals.css`.
 * Width is set inline (148mm) so on-screen preview matches print.
 *
 * All copy is intentionally light-on-light (white card / dark text) —
 * the surrounding app is dark-themed but the receipt is a physical
 * document; we keep classic paper look so a printed copy reads cleanly.
 */
export type ReceiptCardProps = {
  building: {
    name: string;
    address: string | null;
    city: string | null;
    /**
     * Best-effort building phone. `bms_buildings` doesn't have a dedicated
     * `phone` column yet — we pass `public_whatsapp` from the loader so the
     * Telephone line on the receipt isn't blank.
     */
    phone: string | null;
    /**
     * "Registered under Societies Act…" line. Not modeled on
     * bms_buildings yet (see CLAUDE.md "Do NOT touch other tables"); the
     * loader passes null and we hide the line gracefully.
     */
    registration_no: string | null;
  };
  payment: {
    /** Per-building monotonic integer (e.g. 174 → "000174"). */
    receipt_no: number;
    /**
     * Pre-migration TEXT receipt id (e.g. "RCPT-DEMO-PROJ-018") preserved
     * during the `receipt_no` integerisation. Surfaced on admin + union
     * receipts so staff with a paper book can still cross-reference; the
     * caller chooses whether to render via `showLegacyReference`.
     */
    legacy_receipt_no: string | null;
    payment_date: string;
    amount: number;
    /** Raw DB enum value (`cash`/`bank`/`online`/`cheque`/`credit_carryforward`). */
    method: string;
    reference: string | null;
    /**
     * Snapshot of the committee officer who took the cash. Renders on
     * the signature line below the total. Null → "Authorized Signatory"
     * fallback so the layout never breaks.
     */
    received_by_name: string | null;
    received_by_position: string | null;
  };
  flat: { flat_number: string };
  resident: { name: string };
  /**
   * The invoice this payment was applied to. Drives the description line.
   * Null → standalone payment (entry fee / fine / project / other); we
   * fall back to the category/reference for the purpose label.
   */
  invoice: {
    period_label: string;
    purpose: string;
  } | null;
  /**
   * When true, render a small "Legacy reference: …" line in the footer
   * area iff `payment.legacy_receipt_no` is present. Off by default —
   * admin + union routes set this true; the resident route leaves it
   * false so paper-book IDs don't clutter the resident-facing copy.
   */
  showLegacyReference?: boolean;
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank Transfer",
  bank_transfer: "Bank Transfer",
  online: "Online",
  cheque: "Cheque",
  credit_carryforward: "Credit (from previous payment)",
};

function methodLabel(raw: string): string {
  return METHOD_LABEL[raw.toLowerCase()] ?? raw;
}

function formatLongDate(iso: string): string {
  // "20 May 2026" — global SaaS friendly, unambiguous.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function ReceiptCard({
  building,
  payment,
  flat,
  resident,
  invoice,
  showLegacyReference = false,
}: ReceiptCardProps) {
  const receiptNo = formatReceiptNo(payment.receipt_no);
  const dateStr = formatLongDate(payment.payment_date);
  const words = amountInWords(payment.amount);
  const amountStr = formatCurrency(payment.amount);
  const purpose = invoice?.purpose ?? "Maintenance";
  const period = invoice?.period_label ?? null;
  const signerName = payment.received_by_name ?? "";
  const signerRole = payment.received_by_position ?? "Authorized Signatory";
  const addrLine = [building.address, building.city].filter(Boolean).join(", ");

  // Section label — tiny, all-caps, wide tracking, underlined.
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
        width: "30mm",
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
        // Print-color-adjust on the wrapper so the stripe + PAID pill
        // print in color on color-capable printers.
        // (also redeclared in globals.css under @media print).
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* ── 1. Brand accent stripe ─────────────────────────────────── */}
      <div
        style={{
          height: "3mm",
          width: "100%",
          backgroundColor: "hsl(38, 92%, 55%)",
        }}
      />

      <div style={{ padding: "10mm 12mm 12mm 12mm" }}>
        {/* ── 2. Header row ─────────────────────────────────────────── */}
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
              <div
                style={{
                  fontSize: "9pt",
                  marginTop: "1.5mm",
                  color: "#4B5563",
                  lineHeight: 1.4,
                }}
              >
                {addrLine}
              </div>
            )}
            {building.phone && (
              <div
                style={{
                  fontSize: "9pt",
                  marginTop: "0.5mm",
                  color: "#4B5563",
                }}
              >
                {building.phone}
              </div>
            )}
            {building.registration_no && (
              <div
                style={{
                  fontSize: "8pt",
                  marginTop: "1mm",
                  fontStyle: "italic",
                  color: "#6B7280",
                }}
              >
                {building.registration_no}
              </div>
            )}
          </div>

          {/* Receipt-no card (top right) */}
          <div
            style={{
              border: "1px solid #E5E7EB",
              borderRadius: "4mm",
              padding: "3mm 4mm",
              minWidth: "44mm",
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
              Receipt
            </div>
            <div
              style={{
                fontFamily:
                  "'SF Mono', 'JetBrains Mono', 'Menlo', 'Courier New', monospace",
                fontSize: "14pt",
                fontWeight: 600,
                marginTop: "0.5mm",
                color: "#0F172A",
                letterSpacing: "0.02em",
              }}
            >
              #{receiptNo}
            </div>
            <div
              style={{
                marginTop: "2mm",
                display: "inline-flex",
                alignItems: "center",
                gap: "1.5mm",
                backgroundColor: "#ECFDF5",
                color: "#047857",
                border: "1px solid #A7F3D0",
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
                  backgroundColor: "#10B981",
                  display: "inline-block",
                }}
              />
              Paid
            </div>
          </div>
        </header>

        {/* Divider */}
        <div
          style={{
            borderTop: "1px solid #D1D5DB",
            marginBottom: "6mm",
          }}
        />

        {/* ── 3. Two-column meta ────────────────────────────────────── */}
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
              {resident.name}
            </div>
            <div style={{ fontSize: "9pt", color: "#374151", marginTop: "0.8mm" }}>
              Apartment {flat.flat_number}
            </div>
            <div style={{ fontSize: "9pt", color: "#4B5563", marginTop: "0.4mm" }}>
              {building.name}
            </div>
          </div>

          <div>
            <SectionLabel>Payment Details</SectionLabel>
            <MetaRow label="Date" value={dateStr} />
            <MetaRow label="Method" value={methodLabel(payment.method)} />
            <MetaRow
              label={paymentReferenceLabel(payment.method)}
              value={payment.reference ?? "—"}
            />
          </div>
        </div>

        {/* ── 4. Description table ──────────────────────────────────── */}
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
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: "#0F172A" }}>{purpose}</div>
              {period && (
                <div
                  style={{
                    fontSize: "9pt",
                    color: "#4B5563",
                    marginTop: "0.5mm",
                  }}
                >
                  Period: {period}
                </div>
              )}
            </div>
            <div
              style={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: 500,
                color: "#0F172A",
                whiteSpace: "nowrap",
              }}
            >
              {amountStr}
            </div>
          </div>
        </div>

        {/* ── 5. Total band ─────────────────────────────────────────── */}
        <div style={{ marginBottom: "4mm" }}>
          <div
            style={{
              borderTop: "2px solid #0F172A",
              borderBottom: "2px solid #0F172A",
              padding: "3mm 0",
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
              Total Paid
            </span>
            <span
              style={{
                fontSize: "20pt",
                fontWeight: 800,
                color: "#0F172A",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                letterSpacing: "-0.01em",
              }}
            >
              {amountStr}
            </span>
          </div>
        </div>

        {/* ── 6. Amount in words ────────────────────────────────────── */}
        <div
          style={{
            fontSize: "9pt",
            fontStyle: "italic",
            color: "#4B5563",
            marginBottom: "16mm",
          }}
        >
          Amount in words: {words}
        </div>

        {/* ── 7. Signature block ────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "10mm",
          }}
        >
          <div style={{ width: "60mm", textAlign: "left" }}>
            <div
              style={{
                borderTop: "1px solid #374151",
                paddingTop: "1.5mm",
              }}
            />
            <div
              style={{
                fontSize: "10pt",
                fontWeight: 600,
                color: "#0F172A",
              }}
            >
              {signerName || "Authorized Signatory"}
            </div>
            {signerName && (
              <div
                style={{
                  fontSize: "8.5pt",
                  color: "#4B5563",
                  marginTop: "0.3mm",
                }}
              >
                {signerRole}
              </div>
            )}
            <div
              style={{
                fontSize: "8.5pt",
                color: "#4B5563",
                marginTop: "0.3mm",
              }}
            >
              {dateStr}
            </div>
          </div>
        </div>

        {/* ── 8. Footer ─────────────────────────────────────────────── */}
        <div
          style={{
            borderTop: "1px solid #D1D5DB",
            paddingTop: "3mm",
          }}
        >
          <div
            style={{
              fontSize: "7.5pt",
              color: "#4B5563",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "#374151" }}>Terms</strong>
            {" · "}
            Cheque payments subject to realisation
            {" · "}
            Bounced cheque may entail legal action
            {" · "}
            Not a Dues Clearance / No Dues Certificate — such certificates are
            issued separately on request.
          </div>
          {showLegacyReference && payment.legacy_receipt_no && (
            <div
              style={{
                fontSize: "7pt",
                color: "#6B7280",
                marginTop: "2mm",
                fontStyle: "italic",
              }}
            >
              Legacy reference: {payment.legacy_receipt_no}
            </div>
          )}
          <div
            style={{
              fontSize: "7pt",
              color: "#6B7280",
              marginTop: "2mm",
              textAlign: "center",
              letterSpacing: "0.04em",
            }}
          >
            Generated by Pulse BMS · receipt #{receiptNo}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "2mm",
        fontSize: "9.5pt",
        marginBottom: "1.2mm",
        lineHeight: 1.4,
      }}
    >
      <span
        style={{
          color: "#4B5563",
          minWidth: "18mm",
        }}
      >
        {label}:
      </span>
      <span style={{ color: "#111827", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
