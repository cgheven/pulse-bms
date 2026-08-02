/**
 * Platform invoice PDF — PulseHub billing a CLIENT BUILDING for its Pulse BMS
 * subscription.
 *
 * This is NOT a resident maintenance receipt (that's lib/receipts.ts +
 * components/payments/receipt-card.tsx). This renders the vendor-facing
 * invoice that goes out over WhatsApp via the public /invoice/[token] route.
 *
 * WHY jsPDF AND NOT HTML→PDF: the design needs filled/rounded rects, vector
 * icons and colour bands; jsPDF is already a dependency (used by the reports
 * exports) and needs no headless browser at request time.
 *
 * SNAPSHOT DISCIPLINE — READ THIS BEFORE EDITING
 * ---------------------------------------------
 * Every rupee figure on this page comes from a column on the invoice ROW,
 * frozen at generation time by lib/invoice-generation.ts. Nothing here calls
 * `computeInvoiceAmounts()` or `standardMonthlyRate()`, because a historical
 * invoice must not change when the building adds flats or the tier table is
 * repriced. The only things imported from lib/client-pricing.ts are the
 * platform-wide `ONBOARDING_FEE` constant (needed to show what a waiver was
 * worth) and `resolveTier()` (a pure LABEL lookup for the "Plan" row — it
 * touches no money).
 *
 * THEME: this is a PRINT design — white page, ink bands, amber accent. It is
 * deliberately independent of the app's dark-only UI tokens. Do not "fix" it
 * to match --background.
 *
 * SERVER ONLY: reads the logo off disk with node `fs`.
 */
import "server-only";
import { jsPDF } from "jspdf";
import fs from "fs";
import path from "path";
import { ONBOARDING_FEE, resolveTier } from "@/lib/client-pricing";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * The subset of a `bms_platform_invoices` row this renderer needs. Field names
 * match the DB columns 1:1 so a route can pass the row straight through.
 */
export interface PlatformInvoicePdfData {
  /** Human invoice number, e.g. "INV-B0000042". Printed verbatim. */
  invoice_no: string;
  /** e.g. "Aug 2026" (monthly) or "2026" (annual). */
  period_label: string;
  billing_cycle: "monthly" | "annual";

  // ── Pricing snapshot ──
  /** Flats at generation time. Drives the "(N Flats)" label only. */
  flats_count: number;
  /** List price per month for that flat count. */
  standard_monthly_rate: number;
  /** Charged price per month, PRE annual discount (i.e. the override). */
  monthly_rate: number;
  /** Effective total discount vs. standard, display only. */
  discount_pct: number;
  /** List price for the whole period. */
  standard_amount: number;
  /** Charged subscription for the whole period, excludes onboarding. */
  subscription_amount: number;
  /** 0 when waived, or when this isn't the first invoice. */
  onboarding_fee_charged: number;
  is_first_invoice: boolean;
  /** Grand total. Printed verbatim as AMOUNT CHARGED — never recomputed. */
  amount: number;

  // ── Lifecycle ──
  status: "unpaid" | "paid" | "cancelled";
  issue_date: string;
  due_date: string;
  paid_at?: string | null;
  /** Fallback for issue_date on legacy rows. */
  created_at?: string | null;
}

/** Who the invoice is addressed to (the BILLED TO column). */
export interface PlatformInvoiceClient {
  /** Contact person, or the building name when no contact is on file. */
  name: string;
  email?: string | null;
  phone?: string | null;
  /** Building being billed. Shown under the contact when it differs. */
  building_name?: string | null;
}

const INK: [number, number, number] = [17, 17, 19];
const ORANGE: [number, number, number] = [245, 166, 35];
const GRAY: [number, number, number] = [110, 110, 116];
const LIGHT_GRAY: [number, number, number] = [244, 244, 246];
const BORDER: [number, number, number] = [225, 225, 229];
const WHITE: [number, number, number] = [255, 255, 255];
const EMERALD: [number, number, number] = [16, 150, 100];
const CREAM: [number, number, number] = [250, 238, 216];

// ─── Logo ────────────────────────────────────────────────────────────────────
// public/logo.jpeg is a SQUARE 945x945 JPEG (aspect 1.0) with NO alpha — the
// rounded corners of the mark are baked in as near-white pixels. So, unlike
// HMS (which uses a wide transparent PNG wordmark), we draw the square mark and
// then a hand-set "Pulse" wordmark beside it, and we paint over the light
// corner slivers with an ink-coloured rounded stroke. See drawLogo().
//
// NOTE: reading via process.cwd() is not statically traceable by Next's file
// tracer, so under `output: "standalone"` public/ may not sit beside the server
// bundle. The try/catch degrades to a wordmark-only header rather than a 500.
const LOGO_PATH = path.join(process.cwd(), "public", "logo.jpeg");
const LOGO_SIZE = 42;
let logoDataUri: string | null | undefined;
function getLogoDataUri(): string | null {
  if (logoDataUri === undefined) {
    try {
      logoDataUri = `data:image/jpeg;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`;
    } catch {
      logoDataUri = null;
    }
  }
  return logoDataUri;
}

// ─── Formatters ──────────────────────────────────────────────────────────────
/**
 * Money, matching the rest of the app. `formatCurrency` is 0-decimal (every
 * tier price and the onboarding fee are whole rupees), but a bespoke override
 * can carry paisa — in that case we widen to exactly 2dp rather than silently
 * rounding a number the client is being asked to pay.
 */
function pk(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  if (Number.isInteger(n)) return formatCurrency(n);
  return `Rs. ${new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`;
}

/** "02-Aug-2026", via lib/utils formatDate. Null-safe. */
function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "-";
  return formatDate(d);
}

/**
 * Truncate to fit a column. Nothing on this page wraps (a single doc.text per
 * string), and the BILLED TO column is only ~116pt wide — a long Pakistani
 * contact name or building name would otherwise silently run under the dark
 * meta box. Call only with the final font/size already set.
 */
function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxWidth) t = t.slice(0, -1);
  return `${t}...`;
}

// ─── Icons ───────────────────────────────────────────────────────────────────
type IconName = "building" | "person" | "envelope" | "globe" | "phone" | "percent" | "calendar" | "package" | "pin";

/** Small hand-drawn vector glyphs — base14 fonts have no icon characters, so these
 * are built from jsPDF's primitive shapes instead of a font/image dependency. */
function drawIcon(doc: jsPDF, name: IconName, x: number, y: number, size: number, color: [number, number, number]): void {
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(0.6);
  const cx = x + size / 2;
  const cy = y + size / 2;

  switch (name) {
    case "building": {
      // The door is what makes this read as a building rather than an abstract
      // grid of window squares at 9-11pt.
      const w = size * 0.64;
      const h = size * 0.86;
      const bx = x + (size - w) / 2;
      const by = y + (size - h);
      doc.rect(bx, by, w, h, "S");
      const winW = w * 0.24;
      const winH = h * 0.16;
      doc.rect(bx + w * 0.14, by + h * 0.16, winW, winH, "S");
      doc.rect(bx + w * 0.62, by + h * 0.16, winW, winH, "S");
      doc.rect(bx + w * 0.14, by + h * 0.44, winW, winH, "S");
      doc.rect(bx + w * 0.62, by + h * 0.44, winW, winH, "S");
      const doorW = w * 0.32;
      const doorH = h * 0.3;
      doc.rect(bx + (w - doorW) / 2, by + h - doorH, doorW, doorH, "S");
      break;
    }
    case "person": {
      const headR = size * 0.19;
      doc.circle(cx, y + size * 0.28, headR, "S");
      const bw = size * 0.62;
      doc.roundedRect(cx - bw / 2, y + size * 0.48, bw, size * 0.46, 2, 2, "S");
      break;
    }
    case "envelope": {
      const w = size;
      const h = size * 0.72;
      const ey = y + (size - h) / 2;
      doc.rect(x, ey, w, h, "S");
      doc.line(x, ey, x + w / 2, ey + h * 0.58);
      doc.line(x + w, ey, x + w / 2, ey + h * 0.58);
      break;
    }
    case "globe": {
      const r = size / 2;
      doc.circle(cx, cy, r, "S");
      doc.line(x, cy, x + size, cy);
      doc.ellipse(cx, cy, r * 0.4, r, "S");
      break;
    }
    case "phone": {
      const w = size * 0.5;
      const h = size * 0.85;
      doc.roundedRect(cx - w / 2, y + (size - h) / 2, w, h, 2, 2, "S");
      doc.circle(cx, y + size * 0.76, 0.7, "F");
      break;
    }
    case "percent": {
      const r = size * 0.15;
      doc.circle(x + size * 0.27, y + size * 0.27, r, "S");
      doc.circle(x + size * 0.73, y + size * 0.73, r, "S");
      doc.line(x + size * 0.15, y + size * 0.85, x + size * 0.85, y + size * 0.15);
      break;
    }
    case "calendar": {
      const w = size;
      const h = size * 0.82;
      const topPad = size * 0.18;
      doc.roundedRect(x, y + topPad, w, h, 1.2, 1.2, "S");
      doc.line(x + w * 0.24, y + topPad - 2.5, x + w * 0.24, y + topPad + 2);
      doc.line(x + w * 0.76, y + topPad - 2.5, x + w * 0.76, y + topPad + 2);
      doc.line(x, y + topPad + h * 0.32, x + w, y + topPad + h * 0.32);
      doc.rect(x + w * 0.38, y + topPad + h * 0.52, w * 0.24, h * 0.24, "F");
      break;
    }
    case "package": {
      const w = size * 0.85;
      const h = size * 0.75;
      const bx = x + (size - w) / 2;
      const by = y + (size - h);
      doc.rect(bx, by, w, h, "S");
      doc.line(bx, by + h * 0.32, bx + w, by + h * 0.32);
      doc.line(bx + w / 2, by, bx + w / 2, by + h * 0.32);
      break;
    }
    case "pin": {
      const r = size * 0.3;
      const pcx = x + size / 2;
      const pcy = y + r + 1;
      doc.circle(pcx, pcy, r, "S");
      doc.triangle(pcx - r * 0.7, pcy + r * 0.55, pcx + r * 0.7, pcy + r * 0.55, pcx, y + size, "S");
      doc.circle(pcx, pcy, r * 0.32, "F");
      break;
    }
  }
}

function badgedIcon(doc: jsPDF, name: IconName, cx: number, cy: number, badgeR: number): void {
  doc.setFillColor(...CREAM);
  doc.circle(cx, cy, badgeR, "F");
  const size = badgeR * 1.05;
  drawIcon(doc, name, cx - size / 2, cy - size / 2, size, [190, 140, 40]);
}

/**
 * Mark + wordmark, top-left of the ink header band.
 *
 * The JPEG has no alpha, so its baked-in rounded corners are near-white and
 * would show as four bright triangles against the ink band. We erase them by
 * stroking the SAME rounded outline in ink at 6pt — 3pt of that straddles
 * outward, which more than covers the corner sliver (max depth r*(sqrt2-1),
 * about 2.3pt at this size). The mark's own background is already ink-dark, so
 * the stroke is invisible everywhere else.
 */
function drawLogo(doc: jsPDF, x: number, headerH: number): void {
  const logo = getLogoDataUri();
  let wordmarkX = x;

  if (logo) {
    const s = LOGO_SIZE;
    const ly = (headerH - s) / 2 - 4;
    doc.addImage(logo, "JPEG", x, ly, s, s);
    doc.setDrawColor(...INK);
    doc.setLineWidth(6);
    doc.roundedRect(x, ly, s, s, s * 0.13, s * 0.13, "S");
    wordmarkX = x + s + 12;
  }

  doc.setTextColor(...ORANGE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Pulse", wordmarkX, 51);
  doc.setTextColor(200, 200, 205);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Building Management System", wordmarkX, 63);
}

// ─── Renderer ────────────────────────────────────────────────────────────────

export function generatePlatformInvoicePDF(
  invoice: PlatformInvoicePdfData,
  client: PlatformInvoiceClient,
): Uint8Array {
  const W = 480;
  const ML = 24;
  const MR = W - 24;
  const COL_FROM = ML;
  const COL_BILLED = ML + 130;
  const COL_INFO = ML + 260;
  /** Usable width of the FROM / BILLED TO columns (14pt divider gutter). */
  const COL_W = 130 - 14;

  const isAnnual = invoice.billing_cycle === "annual";
  const cycleLabel = isAnnual ? "Annual" : "Monthly";

  // ── Derived DISPLAY figures. Every input is a snapshot column; nothing here
  // reprices anything. `standardOnboarding` is the platform-wide fee, needed
  // only to show what a waiver was worth.
  const standardOnboarding = invoice.is_first_invoice ? ONBOARDING_FEE : 0;
  const onboardingWaived = Math.max(0, standardOnboarding - invoice.onboarding_fee_charged);
  const discountAmount = Math.max(0, invoice.standard_amount - invoice.subscription_amount);
  const listTotal = invoice.standard_amount + standardOnboarding;
  const totalSavings = Math.max(0, listTotal - invoice.amount);

  const flatsLabel = `${invoice.flats_count} Flat${invoice.flats_count === 1 ? "" : "s"}`;
  // Tier NAME only — a label, not a price. See the file header.
  const tierName = resolveTier(invoice.flats_count).name;

  // ── Line-item sub-lines.
  // "Standard" anchors the list price (suppressed for a 0-flat building, where
  // the tier price is 0 and the line would read "Rs. 0/month"). "Charging"
  // appears ONLY when a super-admin override is actually in effect — at the
  // standard rate it would just restate the line above it.
  // These are computed OUT HERE, not inside layout(), so the measure pass and
  // the draw pass can never disagree about the row height.
  const isOverridden = Math.abs(invoice.monthly_rate - invoice.standard_monthly_rate) >= 0.005;
  const subLines: string[] = [];
  if (invoice.standard_monthly_rate > 0) {
    subLines.push(`Standard ${pk(invoice.standard_monthly_rate)}/month${isAnnual ? " x 12 months" : ""}`);
  }
  if (isOverridden) {
    subLines.push(`Charging ${pk(invoice.monthly_rate)}/month`);
  }

  // The onboarding row is OMITTED ENTIRELY when waived (a deliberate divergence
  // from HMS, which printed a "Rs. 0 — waived" row). The waiver is still
  // accounted for in the totals box, so the arithmetic there still closes.
  const showOnboardingRow = invoice.is_first_invoice && invoice.onboarding_fee_charged > 0;

  const statusInfo =
    invoice.status === "paid"
      ? { label: `PAID${invoice.paid_at ? " ON " + fmtDate(invoice.paid_at).toUpperCase() : ""}`, color: EMERALD }
      : invoice.status === "cancelled"
        ? { label: "CANCELLED", color: GRAY }
        : { label: "PENDING PAYMENT", color: ORANGE };

  // ─── Pass 1: measure total height, then pass 2: draw at that page size ────
  // INVARIANT: every `y` mutation lives OUTSIDE the `if (doc)` guards. HMS had
  // two `rightY += 15` advances trapped inside guards, so its measure pass
  // under-counted the BILLED TO column by up to 30pt. Keep it this way.
  function layout(doc: jsPDF | null): number {
    let y = 0;

    // ── Header band ──
    const headerH = 108;
    y = headerH;
    if (doc) {
      doc.setFillColor(...INK);
      doc.rect(0, 0, W, headerH, "F");

      drawLogo(doc, ML, headerH);

      doc.setTextColor(...WHITE);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("INVOICE", MR, 38, { align: "right" });
      doc.setTextColor(190, 190, 196);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`#${invoice.invoice_no}`, MR, 51, { align: "right" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      const pillLabel = statusInfo.label;
      const pillW = doc.getTextWidth(pillLabel) + 22;
      const pillH = 18;
      const pillX = MR - pillW;
      const pillY = 62;
      doc.setDrawColor(...statusInfo.color);
      doc.setLineWidth(0.8);
      doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2, pillH / 2, "S");
      doc.setTextColor(...statusInfo.color);
      doc.text(pillLabel, pillX + pillW / 2, pillY + 12.5, { align: "center" });

      doc.setFillColor(...ORANGE);
      doc.rect(0, headerH - 2, W, 2, "F");
    }
    y += 26;

    // ── FROM | BILLED TO | billing details — three columns, thin vertical rules ──
    const sectionTop = y;
    const headerIconSize = 11;
    const iconSize = 9;
    const textX = 15;

    if (doc) {
      drawIcon(doc, "building", COL_FROM, y - headerIconSize * 0.78, headerIconSize, ORANGE);
      doc.setTextColor(...ORANGE);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("FROM", COL_FROM + headerIconSize + 5, y);

      drawIcon(doc, "person", COL_BILLED, y - headerIconSize * 0.78, headerIconSize, ORANGE);
      doc.text("BILLED TO", COL_BILLED + headerIconSize + 5, y);
    }
    y += 20;

    let leftY = y;
    let rightY = y;

    if (doc) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(20, 20, 22);
      doc.text("PulseHub Private Limited", COL_FROM, leftY);
      doc.text(fitText(doc, client.name, COL_W), COL_BILLED, rightY);
    }
    leftY += 17;
    rightY += 17;

    // FROM: email
    if (doc) {
      drawIcon(doc, "envelope", COL_FROM, leftY - iconSize * 0.68, iconSize, GRAY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text("hello@yourpulse.io", COL_FROM + textX, leftY);
    }
    leftY += 15;

    // BILLED TO: the building being billed (the line item names a flat count,
    // not a building, so without this the invoice doesn't say what it's for).
    const showBuilding = Boolean(client.building_name) && client.building_name !== client.name;
    if (showBuilding) {
      if (doc) {
        drawIcon(doc, "building", COL_BILLED, rightY - iconSize * 0.68, iconSize, GRAY);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY);
        doc.text(fitText(doc, client.building_name as string, COL_W - textX), COL_BILLED + textX, rightY);
      }
      rightY += 15;
    }

    // FROM: site
    if (doc) {
      drawIcon(doc, "globe", COL_FROM, leftY - iconSize * 0.68, iconSize, GRAY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text("bms.yourpulse.io", COL_FROM + textX, leftY);
    }
    leftY += 15;

    // BILLED TO: email
    if (client.email) {
      if (doc) {
        drawIcon(doc, "envelope", COL_BILLED, rightY - iconSize * 0.68, iconSize, GRAY);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY);
        doc.text(fitText(doc, client.email, COL_W - textX), COL_BILLED + textX, rightY);
      }
      rightY += 15;
    }

    // FROM: address
    if (doc) {
      drawIcon(doc, "pin", COL_FROM, leftY - iconSize * 0.68, iconSize, GRAY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text("Karachi, Pakistan", COL_FROM + textX, leftY);
    }
    leftY += 15;

    // BILLED TO: phone
    if (client.phone) {
      if (doc) {
        drawIcon(doc, "phone", COL_BILLED, rightY - iconSize * 0.68, iconSize, GRAY);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY);
        doc.text(fitText(doc, client.phone, COL_W - textX), COL_BILLED + textX, rightY);
      }
      rightY += 15;
    }

    const colContentH = Math.max(leftY, rightY) - sectionTop;

    // ── Dark meta box — the third column ──
    const boxRows: [IconName, string, string][] = [
      ["calendar", "Billing Period", `${invoice.period_label} (${cycleLabel})`],
      ["calendar", "Issue Date", fmtDate(invoice.issue_date ?? invoice.created_at)],
      ["calendar", "Due Date", fmtDate(invoice.due_date)],
      ["package", "Plan", `${tierName} ${cycleLabel}`],
    ];
    const boxPad = 10;
    const boxRowH = 18;
    const boxH = boxPad * 2 + boxRows.length * boxRowH - 4;
    const infoBoxX = COL_INFO;
    const infoBoxW = MR - COL_INFO;
    if (doc) {
      doc.setFillColor(...INK);
      doc.roundedRect(infoBoxX, sectionTop - headerIconSize * 0.6, infoBoxW, boxH, 6, 6, "F");
      let ry = sectionTop - headerIconSize * 0.6 + boxPad + 9;
      for (const [ic, k, v] of boxRows) {
        drawIcon(doc, ic, infoBoxX + 12, ry - 8, 10, ORANGE);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(160, 160, 166);
        doc.text(k, infoBoxX + 28, ry);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...WHITE);
        doc.text(v, infoBoxX + infoBoxW - 12, ry, { align: "right" });
        ry += boxRowH;
      }
    }

    const dividerH = Math.max(colContentH, boxH);
    if (doc) {
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.6);
      doc.line(COL_BILLED - 14, sectionTop - 6, COL_BILLED - 14, sectionTop - 6 + dividerH);
      doc.line(COL_INFO - 14, sectionTop - 6, COL_INFO - 14, sectionTop - 6 + dividerH);
    }

    // The identity block can now be taller than the meta box (building + email
    // + phone), so take whichever actually won rather than assuming the box.
    y = sectionTop - headerIconSize * 0.6 + dividerH + 24;

    if (doc) {
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.6);
      doc.line(ML, y, MR, y);
    }
    y += 22;

    // ── Line-item table header ──
    const tableHeaderH = 22;
    if (doc) {
      doc.setFillColor(...INK);
      doc.rect(ML, y, MR - ML, tableHeaderH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...WHITE);
      doc.text("DESCRIPTION", ML + 10, y + 14);
      doc.text("QTY", MR - 150, y + 14, { align: "center" });
      doc.text("RATE", MR - 80, y + 14, { align: "right" });
      doc.text("AMOUNT", MR - 10, y + 14, { align: "right" });
    }
    y += tableHeaderH + 28;

    // ── Subscription row ──
    // QTY is fixed at 1 and the flat count lives in the description, so RATE
    // and AMOUNT are both the period subscription. (Putting the per-flat rate
    // in RATE with QTY 1 would read as 100 x 1 = 40,000 on the Growth tier.)
    // The per-flat / per-month maths lives in the grey sub-lines instead.
    const rowBadgeR = 13;
    const subLineH = 11;
    const descX = ML + rowBadgeR * 2 + 8;
    if (doc) {
      badgedIcon(doc, "building", ML + rowBadgeR, y + 4, rowBadgeR);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(20, 20, 22);
      doc.text(`Building Subscription (${flatsLabel})`, descX, y);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      subLines.forEach((line, i) => {
        doc.text(line, descX, y + 14 + i * subLineH);
      });

      doc.setTextColor(20, 20, 22);
      doc.text("1", MR - 150, y, { align: "center" });
      doc.text(pk(invoice.subscription_amount), MR - 80, y, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(pk(invoice.subscription_amount), MR - 10, y, { align: "right" });
    }
    // 40pt is the clearance the icon badge needs on its own (radius 13 centred
    // at y+4, so it reaches y+17) and it absorbs the FIRST sub-line for free —
    // only additional sub-lines cost height. The extra 28pt is reserved only
    // when an onboarding row actually follows; on a renewal (or a waived fee,
    // where the row is omitted) it would just be dead space.
    const rowGapExtra = showOnboardingRow ? 28 : 0;
    y += 40 + Math.max(0, subLines.length - 1) * subLineH + rowGapExtra;

    // ── Onboarding row (first invoice, fee actually charged) ──
    if (showOnboardingRow) {
      if (doc) {
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.6);
        doc.line(ML, y - 18 - rowGapExtra / 2, MR, y - 18 - rowGapExtra / 2);

        badgedIcon(doc, "package", ML + rowBadgeR, y - 5, rowBadgeR);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(20, 20, 22);
        doc.text("Onboarding Fee (one-time)", descX, y);
        doc.text(pk(invoice.onboarding_fee_charged), MR - 10, y, { align: "right" });
      }
      y += 30;
    }

    if (doc) {
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.6);
      doc.line(ML, y, MR, y);
    }
    y += 16;

    // ── Totals box (right aligned) ──
    // Reads top-down as: full standard price, each deduction on the way down,
    // then what's actually charged. The waived-onboarding line stays even
    // though its row is omitted above — without it the box wouldn't add up,
    // since "Standard Price" includes the standard onboarding fee.
    const boxW = 190;
    const boxX = MR - boxW;
    const lines: [string, string][] = [];
    if (totalSavings > 0) {
      lines.push(["Standard Price", pk(listTotal)]);
      if (discountAmount > 0) {
        lines.push([`Subscription Discount (${Math.round(invoice.discount_pct)}%)`, `- ${pk(discountAmount)}`]);
      }
      if (onboardingWaived > 0) {
        lines.push(["Onboarding Fee Waived", `- ${pk(onboardingWaived)}`]);
      }
    }
    const totalsRowH = 17;
    const totalsPad = 12;
    const totalsH = totalsPad * 2 + lines.length * totalsRowH + 26 + (totalSavings > 0 ? 16 : 0);

    // ── Bank details — only while payment is outstanding, placed beside the
    // totals box so the otherwise-empty left column gets used. ──
    const showBank = invoice.status === "unpaid";
    const bankRows: [string, string][] = [
      ["Bank", "UBL"],
      ["Account Title", "PulseHub SMC Pvt Ltd"],
      ["Account Number", "0253388111143"],
    ];
    const bankX = ML;
    const bankW = boxX - ML - 20;
    const bankPad = 12;
    const bankHeadH = 18;
    const bankRowH = 15;
    const bankH = bankPad * 2 + bankHeadH + bankRows.length * bankRowH;

    if (doc) {
      doc.setFillColor(...LIGHT_GRAY);
      doc.roundedRect(boxX, y, boxW, totalsH, 6, 6, "F");
      let ry = y + totalsPad + 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      for (const [k, v] of lines) {
        doc.setTextColor(...GRAY);
        doc.text(k, boxX + 14, ry);
        doc.setTextColor(20, 20, 22);
        doc.text(v, boxX + boxW - 14, ry, { align: "right" });
        ry += totalsRowH;
      }
      if (lines.length > 0) {
        doc.setDrawColor(...BORDER);
        doc.line(boxX + 14, ry - 6, boxX + boxW - 14, ry - 6);
        ry += 8;
      } else {
        ry += 2;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(20, 20, 22);
      const chargedLabel = "AMOUNT CHARGED";
      const chargedLabelW = doc.getTextWidth(chargedLabel);
      doc.text(chargedLabel, boxX + 14, ry + 4);

      // The amount is right-aligned against a fixed-width box, so on the Pro
      // tier billed annually (seven figures) 14pt would run straight into the
      // label. Step the size down until it clears — a smaller total is far
      // better than two overlapping strings. Draw-pass only: this changes no
      // geometry, so the measure pass stays in agreement.
      const chargedText = pk(invoice.amount);
      const chargedAvail = boxW - 28 - chargedLabelW - 8;
      let chargedSize = 14;
      doc.setFontSize(chargedSize);
      while (chargedSize > 9 && doc.getTextWidth(chargedText) > chargedAvail) {
        chargedSize -= 0.5;
        doc.setFontSize(chargedSize);
      }
      doc.setTextColor(...ORANGE);
      doc.text(chargedText, boxX + boxW - 14, ry + 5, { align: "right" });

      if (totalSavings > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...EMERALD);
        doc.text(`${pk(totalSavings)} saved vs. our standard pricing`, boxX + boxW - 14, ry + 18, { align: "right" });
      }
    }

    if (showBank && doc) {
      doc.setFillColor(...LIGHT_GRAY);
      doc.roundedRect(bankX, y, bankW, bankH, 6, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(20, 20, 22);
      doc.text("BANK DETAILS FOR PAYMENT", bankX + 14, y + bankPad + 6);
      let ry = y + bankPad + bankHeadH + 8;
      doc.setFontSize(8.5);
      for (const [k, v] of bankRows) {
        const label = `${k}: `;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...GRAY);
        doc.text(label, bankX + 14, ry);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 20, 22);
        doc.text(v, bankX + 14 + doc.getTextWidth(label), ry);
        ry += bankRowH;
      }
    }

    y += Math.max(totalsH, showBank ? bankH : 0) + (totalSavings > 0 ? 40 : 26);

    // ── Payment note — replaces the bank block once settled or cancelled ──
    if (invoice.status !== "unpaid") {
      const noteText =
        invoice.status === "paid"
          ? statusInfo.label.replace("PAID ON", "Payment received on")
          : "This invoice has been cancelled.";
      const noteBg: [number, number, number] = invoice.status === "paid" ? [230, 246, 240] : LIGHT_GRAY;
      const noteColor: [number, number, number] = invoice.status === "paid" ? EMERALD : GRAY;
      const noteH = 30;
      if (doc) {
        doc.setFillColor(...noteBg);
        doc.roundedRect(ML, y, MR - ML, noteH, 6, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...noteColor);
        doc.text(noteText, W / 2, y + 19, { align: "center" });
      }
      y += noteH + 20;
    }

    if (doc) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text("Thank you for using Pulse.", W / 2, y, { align: "center" });
    }
    y += 26;

    // ── Bottom bar ──
    const footerH = 30;
    if (doc) {
      doc.setFillColor(...INK);
      doc.rect(0, y, W, footerH, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(200, 200, 205);
      doc.text("hello@yourpulse.io", ML, y + 19);
      doc.text("bms.yourpulse.io", MR, y + 19, { align: "right" });
    }
    y += footerH;

    return y;
  }

  const totalHeight = layout(null);
  // jsPDF silently swaps width/height to force portrait unless orientation is
  // stated explicitly. Keep the ternary.
  const doc = new jsPDF({ unit: "pt", format: [W, totalHeight], orientation: totalHeight >= W ? "p" : "l" });
  layout(doc);

  return new Uint8Array(doc.output("arraybuffer"));
}
