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
 * Month switcher for the admin dashboard.
 *
 * Navigates to `?month=YYYY-MM` so the server re-runs every tile against the
 * chosen month. The current month drops the param entirely, keeping the
 * default URL clean and shareable.
 */
export function DashboardMonthFilter({
  months,
  value,
  currentMonth,
}: {
  months: string[];
  value: string;
  currentMonth: string;
}) {
  const router = useRouter();

  const onChange = (next: string) => {
    router.push(next === currentMonth ? "/admin" : `/admin?month=${next}`);
  };

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[11rem] text-xs">
        <SelectValue placeholder="Month" />
      </SelectTrigger>
      <SelectContent>
        {months.map((m) => (
          <SelectItem key={m} value={m}>
            {m === currentMonth
              ? `${formatMonthLabel(m)} (current)`
              : formatMonthLabel(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
