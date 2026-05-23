/**
 * Convert a PKR rupee amount to its words form using the South Asian
 * "Lakh / Crore" convention shown on Karachi paper receipts:
 *   1,00,000     → "One Lakh"
 *   12,34,567    → "Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven"
 *   1,50,00,000  → "One Crore Fifty Lakh"
 *
 * The output ALWAYS ends with " Rupees Only" so it can drop straight into
 * the printed receipt's "The sum of Rupees …" line. Receipts are always
 * whole rupees in PK paper books — we round half-up so the words match
 * the formatted currency on the same row.
 */

const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function twoDigit(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? TENS[t] : `${TENS[t]}-${ONES[u]}`;
}

function threeDigit(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h > 0) parts.push(`${ONES[h]} Hundred`);
  if (rest > 0) parts.push(twoDigit(rest));
  return parts.join(" ");
}

export function amountInWords(amount: number): string {
  if (!Number.isFinite(amount)) return "Zero Rupees Only";
  const n = Math.max(0, Math.round(amount));
  if (n === 0) return "Zero Rupees Only";

  // Crore = 1,00,00,000 (10^7); Lakh = 1,00,000 (10^5).
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const hundred = n % 1000;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${twoDigit(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigit(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigit(thousand)} Thousand`);
  if (hundred > 0) parts.push(threeDigit(hundred));

  return `${parts.join(" ")} Rupees Only`;
}

// ─── Spec test cases (sanity checked manually) ───────────────────────
//   amountInWords(0)         === "Zero Rupees Only"
//   amountInWords(5000)      === "Five Thousand Rupees Only"
//   amountInWords(11000)     === "Eleven Thousand Rupees Only"
//   amountInWords(155000)    === "One Lakh Fifty-Five Thousand Rupees Only"
//   amountInWords(1234567)   === "Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven Rupees Only"
//   amountInWords(15000000)  === "One Crore Fifty Lakh Rupees Only"
