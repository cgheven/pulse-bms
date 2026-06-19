"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function SpendingTypeToggle({ active }: { active: "expenses" | "bills" }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1 border border-border">
      <Link
        href="/admin/reports/spending"
        className={cn(
          "inline-flex items-center rounded-md px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap",
          active === "expenses"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Operating Expenses
      </Link>
      <Link
        href="/admin/reports/spending?type=bills"
        className={cn(
          "inline-flex items-center rounded-md px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap",
          active === "bills"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Utility Bills
      </Link>
    </div>
  );
}
