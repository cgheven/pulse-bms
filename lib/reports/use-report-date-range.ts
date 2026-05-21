"use client";

// Pulse BMS — Reports date-range URL-sync hook
//
// Reports fetch from Supabase with `.gte / .lte` on payment_date or
// expense_date. To keep the fetch payload small (this_month default ≈ 30
// days vs the entire history) the range MUST live in the URL — that's the
// only key the server page sees on a soft nav.
//
// This hook keeps a local copy of the DateRange for instant UI feedback
// AND pushes it into ?from=&to= via router.push, which triggers the RSC
// server component to refetch with the new bounds. We use scroll:false so
// the user doesn't jump on every preset click.

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { DateRange } from "@/lib/reports/types";

export function useReportDateRange(initial: DateRange) {
  const router = useRouter();
  const pathname = usePathname();
  const [dateRange, setDateRangeState] = useState<DateRange>(initial);

  const setDateRange = useCallback(
    (next: DateRange) => {
      setDateRangeState(next);
      const sp = new URLSearchParams();
      sp.set("from", next.from);
      sp.set("to", next.to);
      router.push(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

  return [dateRange, setDateRange] as const;
}
