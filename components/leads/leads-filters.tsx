"use client";

// URL-driven filter row for the leads list. We push to the same path with
// merged query params so deep-links + back/forward all work. Mirrors the
// pattern in `components/super-admin/audit-filters.tsx`.

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "demo_done", label: "Demo Done" },
  { value: "negotiating", label: "Negotiating" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "dormant", label: "Dormant" },
];

export function LeadsFilters({
  status,
  overdue,
  dueToday,
  q,
}: {
  status: string;
  overdue: boolean;
  dueToday: boolean;
  q: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(q);

  // Debounce search input — push 350ms after the user stops typing so we
  // don't spam server renders on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search === q) return;
      pushParams({ q: search || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function pushParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <div className="card-soft space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[180px]">
          <Select
            value={status || "all"}
            onValueChange={(v) => pushParams({ status: v })}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* dueToday & overdue are mutually exclusive — toggling one
            clears the other so the URL never carries a contradictory
            pair. */}
        <label className="flex items-center gap-2 h-11 px-3 rounded-md border border-input cursor-pointer select-none text-sm">
          <input
            type="checkbox"
            checked={dueToday}
            onChange={(e) => {
              // Turning on dueToday clears overdue (mutually exclusive);
              // turning it off leaves overdue alone.
              if (e.target.checked) {
                pushParams({ dueToday: "1", overdue: null });
              } else {
                pushParams({ dueToday: null });
              }
            }}
            className="h-4 w-4"
          />
          Due today only
        </label>
        <label className="flex items-center gap-2 h-11 px-3 rounded-md border border-input cursor-pointer select-none text-sm">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => {
              if (e.target.checked) {
                pushParams({ overdue: "1", dueToday: null });
              } else {
                pushParams({ overdue: null });
              }
            }}
            className="h-4 w-4"
          />
          Show overdue only
        </label>

        <div className="flex-1 min-w-[200px]">
          <Input
            type="search"
            placeholder="Search building, contact, area…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      {/* Active-filter summary so the user can see (and clear) what's
          currently constraining the list. */}
      {(dueToday || overdue) && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Active filter:
          </span>
          {dueToday && (
            <button
              type="button"
              onClick={() => pushParams({ dueToday: null })}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/15 text-warning text-xs font-medium hover:bg-warning/25 transition"
              aria-label="Clear Due today filter"
            >
              Due today
              <span aria-hidden>×</span>
            </button>
          )}
          {overdue && (
            <button
              type="button"
              onClick={() => pushParams({ overdue: null })}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/15 text-destructive text-xs font-medium hover:bg-destructive/25 transition"
              aria-label="Clear Overdue filter"
            >
              Overdue
              <span aria-hidden>×</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
