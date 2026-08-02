import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return `Rs. ${new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

export function formatLakh(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 10_000_000) return `${sign}Rs. ${(abs / 10_000_000).toFixed(1)} Cr`;
  if (abs >= 100_000)    return `${sign}Rs. ${(abs / 100_000).toFixed(1)} Lakh`;
  return formatCurrency(amount);
}

export function formatSignedCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = `Rs. ${new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs)}`;
  if (amount > 0) return `+${formatted}`;
  if (amount < 0) return `−${formatted}`;
  return formatted;
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatRelative(date: string | Date): string {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60)            return "just now";
  if (diff < 3600)          return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)         return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30)    return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 365)   return `${Math.floor(diff / (86400 * 30))}mo ago`;
  return `${Math.floor(diff / (86400 * 365))}y ago`;
}

export function formatDateInput(date: Date) {
  return date.toISOString().split("T")[0];
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+92 ${digits.slice(1, 4)}-${digits.slice(4)}`;
  }
  return phone;
}

export function formatCNIC(cnic: string): string {
  const digits = cnic.replace(/\D/g, "");
  if (digits.length === 13) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  }
  return cnic;
}

export function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: formatDateInput(start),
    end: formatDateInput(end),
  };
}

/**
 * "2026-01" → "January 2026". Parsed as local midnight — `new Date("2026-01")`
 * is treated as UTC and would render the previous month west of Greenwich.
 */
export function formatMonthLabel(ym: string): string {
  return new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-PK", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Inclusive first/last day of a "YYYY-MM" month, as YYYY-MM-DD strings.
 * Safe for date-only columns (`expense_date`, `billing_month`).
 */
export function getMonthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return {
    start: `${ym}-01`,
    end: formatDateInput(new Date(y, m, 0)),
  };
}

export function getDaysUntilExpiry(expiryDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

export function getMemberStatusColor(status: string): string {
  switch (status) {
    case "active":    return "text-success bg-success/10 border-success/20";
    case "expired":   return "text-destructive bg-destructive/10 border-destructive/20";
    case "frozen":    return "text-info bg-info/10 border-info/20";
    case "cancelled": return "text-muted-foreground bg-muted border-border";
    default:          return "text-muted-foreground bg-muted border-border";
  }
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Render a per-building receipt sequence as a 6-digit zero-padded string
 * to mirror the paper receipt-book convention used by Karachi societies
 * (e.g. `174` → `"000174"`). Pass `null`/`undefined`/0 → empty string so
 * callers can fall back to a placeholder.
 */
export function formatReceiptNo(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  return String(Math.trunc(n)).padStart(6, "0");
}
