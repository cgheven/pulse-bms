"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatMonthLabel } from "@/lib/utils";

/**
 * Month picker for /admin/expenses.
 *
 * The page filters server-side via `?month=YYYY-MM` (so the `.limit(500)` cap
 * applies *after* the month narrows the set, not before). The current tab and
 * category are carried through so switching month doesn't dump you back on
 * the Bills tab with the category filter cleared.
 */
export function ExpenseMonthFilter({
  months,
  value,
  tab,
  category,
}: {
  months: string[];
  value: string;
  tab?: string;
  category?: string;
}) {
  const router = useRouter();

  const onChange = (next: string) => {
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    if (category) params.set("category", category);
    if (next !== "all") params.set("month", next);
    const qs = params.toString();
    router.push(qs ? `/admin/expenses?${qs}` : "/admin/expenses");
  };

  return (
    <Select value={value} onValueChange={onChange}>
      {/* h-9 matches the TabsList pill height (p-1 + py-1.5 triggers) so the
          control sits flush with the Bills/Expenses tabs on the same row. */}
      <SelectTrigger className="h-9 w-full sm:w-44">
        <SelectValue placeholder="Month" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All months</SelectItem>
        {months.map((m) => (
          <SelectItem key={m} value={m}>
            {formatMonthLabel(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
