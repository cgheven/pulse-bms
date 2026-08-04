"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatMonthLabel } from "@/lib/utils";

/** Subcategory value meaning "rows with no head set". NULL in the DB. */
export const NO_SUBCATEGORY = "__none__";

export type SubOption = {
  /** Canonical raw value, used in the URL. Or NO_SUBCATEGORY. */
  value: string;
  label: string;
  /**
   * Every raw slug that renders as this label. Buildings have recorded the
   * same head under more than one slug (corridor_electricity AND
   * electricity_corridor at Sunrise), so the option lists one entry but the
   * filter must match all of them or it silently drops rows.
   */
  values: string[];
  /** Which category it belongs to, so the list narrows with the category. */
  category: string;
};

/**
 * Search + category + subcategory + month filter row for /admin/expenses.
 *
 * Everything is URL-driven (`?q=`, `?category=`, `?sub=`, `?month=`) and
 * applied server-side, so the list's row cap is applied *after* filtering —
 * a filter never misses an older row that fell outside the cap. All four
 * apply to both the Bills and Expenses tabs.
 */
export function ExpenseFilters({
  months,
  month,
  q,
  category,
  categories,
  sub,
  subOptions,
  tab,
}: {
  months: string[];
  /** `YYYY-MM`, or "all". */
  month: string;
  q: string;
  /** Category slug, or "all". */
  category: string;
  categories: { value: string; label: string }[];
  /** Subcategory slug, NO_SUBCATEGORY, or "all". */
  sub: string;
  subOptions: SubOption[];
  tab?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(q);

  // What we last sent to the URL. Used to tell "the server echoed my own
  // search back" apart from "the user hit Back" — without it, a keystroke
  // landing between the push and the re-render gets reverted.
  const lastPushed = useRef(q);

  // Only heads belonging to the chosen category, so picking Repairs doesn't
  // leave "Corridor Electricity" on offer. "Not specified" spans categories,
  // so it is kept whichever category is active.
  const visibleSubs = useMemo(() => {
    if (category === "all") return subOptions;
    return subOptions.filter(
      (s) => s.category === category || s.value === NO_SUBCATEGORY,
    );
  }, [subOptions, category]);

  const push = (next: {
    month?: string;
    q?: string;
    category?: string;
    sub?: string;
  }) => {
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);

    const c = next.category ?? category;
    if (c && c !== "all") params.set("category", c);

    // Changing the category drops the head — a head belongs to exactly one
    // category, so keeping it would filter to an empty set.
    const s = next.category !== undefined ? "all" : (next.sub ?? sub);
    if (s && s !== "all") params.set("sub", s);

    const m = next.month ?? month;
    if (m && m !== "all") params.set("month", m);

    const text = next.q ?? search.trim();
    if (text) params.set("q", text);
    lastPushed.current = text;

    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/admin/expenses?${qs}` : "/admin/expenses");
    });
  };

  // Debounce typing — push 350ms after the user stops so we don't fire a
  // server render per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() === q) return;
      push({ q: search.trim() });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Back/forward navigation changes `q` from outside — mirror it into the box.
  useEffect(() => {
    if (q !== lastPushed.current) {
      lastPushed.current = q;
      setSearch(q);
    }
  }, [q]);

  return (
    // h-9 on every control matches the TabsList pill height so the row sits
    // flush with the tabs; wraps to its own line when the tabs crowd it out.
    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
      <div className="relative flex-1 min-w-[12rem] sm:flex-none sm:w-56">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          aria-label="Search bills and expenses"
          className="h-9 pl-9 pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              push({ q: "" });
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Select
        value={category}
        onValueChange={(next) => push({ category: next })}
      >
        <SelectTrigger className="h-9 w-[8.5rem]" aria-label="Category">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={sub}
        onValueChange={(next) => push({ sub: next })}
        disabled={visibleSubs.length === 0}
      >
        <SelectTrigger className="h-9 w-[11rem]" aria-label="Subcategory">
          <SelectValue placeholder="Subcategory" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All subcategories</SelectItem>
          {visibleSubs.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={month} onValueChange={(next) => push({ month: next })}>
        <SelectTrigger className="h-9 w-[10rem]" aria-busy={isPending}>
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
    </div>
  );
}
