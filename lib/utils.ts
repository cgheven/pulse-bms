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
  if (amount >= 10_000_000) return `Rs. ${(amount / 10_000_000).toFixed(1)} Cr`;
  if (amount >= 100_000)    return `Rs. ${(amount / 100_000).toFixed(1)} Lakh`;
  return formatCurrency(amount);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
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
