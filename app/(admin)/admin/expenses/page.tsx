import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import {
  formatCurrency,
  formatDate,
  formatMonthLabel,
  getMonthBounds,
} from "@/lib/utils";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_FILTER_CATEGORIES,
  prettifyExpenseSubcategory,
} from "@/lib/expense-constants";
import { AddExpenseButton } from "@/components/admin/expenses/add-expense-button";
import { ExpenseRowActions } from "@/components/admin/expenses/expense-row-actions";
import {
  ExpenseFilters,
  NO_SUBCATEGORY,
  type SubOption,
} from "@/components/admin/expenses/expense-filters";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  category?: string;
  sub?: string;
  tab?: string;
  month?: string;
  q?: string;
}>;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Rows rendered per list tab. Totals are computed separately, over everything. */
const LIST_LIMIT = 500;
/** PostgREST max_rows in this project — an unbounded select truncates here. */
const PAGE_SIZE = 1000;

/**
 * Make a user search term safe to embed in a PostgREST `or=` filter.
 *
 * `or=` is parsed on commas and parentheses, and `*` / `%` are the `ilike`
 * wildcards — an unescaped term could restructure the filter or match every
 * row. Stripping those characters is enough because the remaining value is
 * always the last segment of `column.op.value`, where dots are literal.
 */
function sanitizeSearch(raw: string | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 60).replace(/[,()*%"\\]/g, "").trim();
}

/**
 * Every month between the building's first and last recorded expense, newest
 * first. Months with no rows are kept in the list on purpose — picking one and
 * seeing zero is a legitimate answer ("did we log anything in March?").
 */
function buildMonthOptions(
  oldest: string | undefined,
  newest: string | undefined,
  selected?: string,
): string[] {
  const set = new Set<string>();
  if (oldest && newest) {
    const [oy, om] = oldest.slice(0, 7).split("-").map(Number);
    const [ny, nm] = newest.slice(0, 7).split("-").map(Number);
    let y = oy;
    let m = om;
    // Hard iteration cap so a malformed date can't spin this forever.
    for (let i = 0; i < 600 && (y < ny || (y === ny && m <= nm)); i++) {
      set.add(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
      if (m === 12) {
        y += 1;
        m = 1;
      } else {
        m += 1;
      }
    }
  }
  // Keep a deep-linked month selectable even if it falls outside the data range.
  if (selected) set.add(selected);
  return Array.from(set).sort().reverse();
}

export default function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6 animate-fade-up">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <ExpensesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ExpensesContent({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground">No building assigned to your account.</p>
      </div>
    );
  }
  const sp = await searchParams;
  const supabase = await createClient();

  // `?month=YYYY-MM` narrows both lists and the summary. Validated against a
  // strict pattern so a junk value can't silently blank the page.
  const selectedMonth = sp.month && MONTH_RE.test(sp.month) ? sp.month : undefined;
  // No month picked means "everything", for the totals as well as the lists —
  // the cards and the summary must agree with what the tables show.
  const month = selectedMonth ? getMonthBounds(selectedMonth) : null;
  const search = sanitizeSearch(sp.q);
  // Category is whitelisted; subcategory is free text in the DB, so it is
  // accepted as-is and only ever used through .eq()/.is(), never interpolated
  // into an `or=` string.
  const selectedCategory =
    sp.category && sp.category in EXPENSE_FILTER_CATEGORIES ? sp.category : undefined;
  const selectedSub = sp.sub?.trim() ? sp.sub.trim() : undefined;
  // A purely numeric term is also matched against the amount, so typing an
  // exact figure off a receipt finds the row.
  const amountTerm = /^\d+(\.\d{1,2})?$/.test(search) ? search : null;

  // Bill accounts are needed *before* the bills query is built, because
  // searching "Block A" or an account number has to resolve to bill_account_id
  // — bms_expenses stores only the FK.
  // Head options are resolved here too, not in the main batch: picking a head
  // has to filter on EVERY slug sharing its label, so the group must be known
  // before the queries are built.
  const [{ data: billAccounts, error: baErr }, subOptions] = await Promise.all([
    supabase
      .from("bms_bill_accounts")
      .select("id, nickname, account_number, provider")
      .eq("building_id", buildingId),
    fetchHeadOptions(),
  ]);
  if (baErr) console.error("[expenses] bill_accounts query failed:", baErr.message);

  // Every raw slug the selected head covers. Falls back to the bare value if
  // the head isn't in the option list (hand-edited URL).
  const selectedSubValues =
    selectedSub && selectedSub !== NO_SUBCATEGORY
      ? (subOptions.find(
          (o) => o.value === selectedSub || o.values.includes(selectedSub),
        )?.values ?? [selectedSub])
      : [];

  const billAccountMap = new Map((billAccounts ?? []).map((b) => [b.id, b]));

  const needle = search.toLowerCase();
  const matchedAccountIds = search
    ? (billAccounts ?? [])
        .filter((a) =>
          [a.nickname, a.account_number, a.provider].some((v) =>
            v?.toLowerCase().includes(needle),
          ),
        )
        .map((a) => a.id)
    : [];

  /** PostgREST `or=` clause for the search term, or null when not searching. */
  function searchClause(isBill: boolean): string | null {
    if (!search) return null;
    const parts = [`description.ilike.*${search}*`, `vendor.ilike.*${search}*`];
    if (isBill) {
      if (matchedAccountIds.length > 0) {
        parts.push(`bill_account_id.in.(${matchedAccountIds.join(",")})`);
      }
    } else {
      parts.push(`category.ilike.*${search}*`, `subcategory.ilike.*${search}*`);
    }
    if (amountTerm) parts.push(`amount.eq.${amountTerm}`);
    return parts.join(",");
  }

  const billsClause = searchClause(true);
  const expensesClause = searchClause(false);

  /**
   * Category + subcategory, applied identically to bills and expenses.
   *
   * NO_SUBCATEGORY maps to `IS NULL` rather than an OR across NULL and "" —
   * migration 20260805000001 collapsed the empty strings, which keeps this a
   * single filter and leaves `or=` free for the search clause.
   */
  function applyHeadFilters<T extends {
    eq: (c: string, v: string) => T;
    is: (c: string, v: null) => T;
    in: (c: string, v: string[]) => T;
  }>(q: T): T {
    let out = q;
    if (selectedCategory) out = out.eq("category", selectedCategory);
    if (selectedSub === NO_SUBCATEGORY) out = out.is("subcategory", null);
    else if (selectedSubValues.length > 0) {
      out = out.in("subcategory", selectedSubValues);
    }
    return out;
  }

  // Category, month and search are all pushed to the DB so the LIST_LIMIT cap
  // is applied after filtering, not before (avoids silently missing older
  // rows that match). Built as factories because each is run twice: once for
  // the visible page of rows, once paged for the totals.
  //
  // The secondary sort on id keeps `.range()` paging stable — expense_date
  // alone has ties, and Postgres may order ties differently per page.
  const buildBills = <C extends string>(cols: C) => {
    let q = supabase
      .from("bms_expenses")
      .select(cols)
      .eq("building_id", buildingId)
      .eq("is_bill", true);
    q = applyHeadFilters(q);
    if (month) {
      q = q.gte("expense_date", month.start).lte("expense_date", month.end);
    }
    if (billsClause) q = q.or(billsClause);
    return q
      .order("expense_date", { ascending: false })
      .order("id", { ascending: true });
  };

  const buildExpenses = <C extends string>(cols: C) => {
    // `is_bill IS NOT TRUE` covers both false and NULL in one filter, leaving
    // `or=` free for the search clause (repeated or= params are ANDed).
    let q = supabase
      .from("bms_expenses")
      .select(cols)
      .eq("building_id", buildingId)
      .not("is_bill", "is", true);
    q = applyHeadFilters(q);
    if (month) {
      q = q.gte("expense_date", month.start).lte("expense_date", month.end);
    }
    if (expensesClause) q = q.or(expensesClause);
    return q
      .order("expense_date", { ascending: false })
      .order("id", { ascending: true });
  };

  type AggRow = { amount: number | string | null; category: string | null };
  type AggResult = {
    total: number;
    count: number;
    byCategory: Map<string, number>;
    /** false when a page errored — the figure shown is a floor, not a total. */
    exact: boolean;
  };

  /**
   * Sum + count every matching row, paging past the 1000-row max_rows ceiling.
   * Never use PostgREST aggregate syntax here — it is disabled on this project
   * and fails silently as 0 (see CLAUDE.md → Database constraints).
   */
  async function pagedAggregate(
    run: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: AggRow[] | null; error: { message: string } | null }>,
    label: string,
  ): Promise<AggResult> {
    let total = 0;
    let count = 0;
    const byCategory = new Map<string, number>();
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await run(from, from + PAGE_SIZE - 1);
      if (error) {
        console.error(`[expenses] ${label} totals failed:`, error.message);
        return { total, count, byCategory, exact: false };
      }
      const rows = data ?? [];
      for (const r of rows) {
        const amt = Number(r.amount ?? 0);
        total += amt;
        if (r.category) {
          byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + amt);
        }
      }
      count += rows.length;
      if (rows.length < PAGE_SIZE) return { total, count, byCategory, exact: true };
    }
  }

  /**
   * Every (category, subcategory) pair this building has ever used, for the
   * subcategory dropdown. Deliberately scoped to the building ONLY — not to
   * the current month/search — so the option list doesn't shrink out from
   * under you as you filter. Paged past max_rows; two small text columns.
   */
  async function fetchHeadOptions(): Promise<SubOption[]> {
    const seen = new Map<string, SubOption>();
    let anyUnset = false;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("bms_expenses")
        .select("category, subcategory")
        .eq("building_id", buildingId)
        .order("category", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        console.error("[expenses] head options failed:", error.message);
        break;
      }
      const rows = data ?? [];
      for (const r of rows) {
        if (!r.subcategory) {
          anyUnset = true;
          continue;
        }
        const label = prettifyExpenseSubcategory(r.subcategory);
        // Key on the LABEL, not the raw slug: corridor_electricity and
        // electricity_corridor both render as "Corridor Electricity", and
        // offering that twice in the dropdown is just confusing.
        const key = `${r.category}::${label.toLowerCase()}`;
        const existing = seen.get(key);
        if (existing) {
          if (!existing.values.includes(r.subcategory)) {
            existing.values.push(r.subcategory);
          }
        } else {
          seen.set(key, {
            value: r.subcategory,
            label,
            values: [r.subcategory],
            category: r.category,
          });
        }
      }
      if (rows.length < PAGE_SIZE) break;
    }
    const out = Array.from(seen.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    if (anyUnset) {
      out.push({
        value: NO_SUBCATEGORY,
        label: "Not specified",
        values: [NO_SUBCATEGORY],
        category: "*",
      });
    }
    return out;
  }

  const [
    { data: billsRaw, error: billsErr },
    { data: expensesRaw, error: expensesErr },
    billsTotals,
    expensesTotals,
    { data: oldestRow },
    { data: newestRow },
  ] = await Promise.all([
    buildBills("*").limit(LIST_LIMIT),
    buildExpenses("*").limit(LIST_LIMIT),
    pagedAggregate(
      (from, to) => buildBills("amount, category").range(from, to),
      "bills",
    ),
    pagedAggregate(
      (from, to) => buildExpenses("amount, category").range(from, to),
      "expenses",
    ),
    // Month options are derived from the first/last dated row rather than by
    // pulling every expense_date — two indexed single-row reads, and no risk
    // of the option list being truncated by a row cap.
    supabase
      .from("bms_expenses")
      .select("expense_date")
      .eq("building_id", buildingId)
      .order("expense_date", { ascending: true })
      .limit(1),
    supabase
      .from("bms_expenses")
      .select("expense_date")
      .eq("building_id", buildingId)
      .order("expense_date", { ascending: false })
      .limit(1),
  ]);

  const monthOptions = buildMonthOptions(
    oldestRow?.[0]?.expense_date,
    newestRow?.[0]?.expense_date,
    selectedMonth,
  );

  if (billsErr) console.error("[expenses] bills query failed:", billsErr.message);
  if (expensesErr) console.error("[expenses] expenses query failed:", expensesErr.message);

  const bills = billsRaw ?? [];
  const expenses = expensesRaw ?? [];

  const billsTotal = billsTotals.total;
  const expensesTotal = expensesTotals.total;
  const groups = expensesTotals.byCategory;

  // What the figures on this screen cover, spelled out — the cards, the tab
  // counts and the summary all move with the filters, so the scope has to be
  // visible or the numbers look wrong.
  const scopeLabel = [
    selectedMonth ? formatMonthLabel(selectedMonth) : "All months",
    search ? `matching “${search}”` : null,
    selectedCategory
      ? EXPENSE_CATEGORY_LABELS[selectedCategory] ?? selectedCategory
      : null,
    selectedSub
      ? selectedSub === NO_SUBCATEGORY
        ? "no subcategory"
        : prettifyExpenseSubcategory(selectedSub)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const expenseRowProps = (e: typeof expenses[0]) => ({
    id: e.id,
    category: e.category,
    subcategory: e.subcategory,
    description: e.description,
    amount: Number(e.amount),
    expense_date: e.expense_date,
    is_recurring: e.is_recurring,
    recurrence: e.recurrence,
    vendor: e.vendor,
    receipt_url: e.receipt_url,
    is_bill: e.is_bill,
    bank_account_id: e.bank_account_id,
    bill_account_id: e.bill_account_id,
    units_consumed: e.units_consumed ?? null,
    due_date: e.due_date ?? null,
  });

  // Whitelist-validate tab param so an unknown value doesn't blank the page.
  const VALID_TABS = ["bills", "expenses", "summary"] as const;
  const activeTab: string = VALID_TABS.includes(sp.tab as typeof VALID_TABS[number])
    ? sp.tab!
    : "bills";

  /** "Showing the most recent 500 of 812" when the list cap bites. */
  const truncationNote = (shown: number, agg: AggResult) =>
    agg.exact && agg.count > shown ? (
      <p className="text-xs text-muted-foreground px-1">
        Showing the {shown} most recent of {agg.count}. Narrow by month or search
        to see the rest — the totals above cover all {agg.count}.
      </p>
    ) : null;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1>Bills &amp; Expenses</h1>
        <div className="flex gap-2">
          <AddExpenseButton buildingId={buildingId} mode="bill" />
          <AddExpenseButton buildingId={buildingId} mode="expense" />
        </div>
      </div>

      {/* Totals for whatever is currently filtered — visible on every tab, so
          the spend figure doesn't require switching to the summary. Computed
          over every matching row, not just the 500 rendered below. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-lg">
          <div className="text-xs text-muted-foreground">Bills</div>
          <div className="text-2xl font-bold mt-0.5 tabular-nums">
            {formatCurrency(billsTotal)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {billsTotals.count} {billsTotals.count === 1 ? "entry" : "entries"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-lg">
          <div className="text-xs text-muted-foreground">Expenses</div>
          <div className="text-2xl font-bold mt-0.5 tabular-nums">
            {formatCurrency(expensesTotal)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {expensesTotals.count}{" "}
            {expensesTotals.count === 1 ? "entry" : "entries"}
          </div>
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-lg col-span-2 sm:col-span-1">
          <div className="text-xs text-muted-foreground">Total spend</div>
          <div className="text-2xl font-bold mt-0.5 tabular-nums text-primary">
            {formatCurrency(billsTotal + expensesTotal)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{scopeLabel}</div>
        </div>
      </div>

      {(!billsTotals.exact || !expensesTotals.exact) && (
        <p className="text-xs text-destructive">
          A totals query failed — the figures above are incomplete. Check the
          server logs.
        </p>
      )}

      {/* key forces Radix to remount on tab changes from URL navigation,
          because defaultValue is only consumed at initial mount and Next.js
          App Router reconciles client components in place without remounting. */}
      <Tabs key={activeTab} defaultValue={activeTab}>
        {/* Tabs and the filters share one row — the tab pill is only as wide as
            its labels, so the leftover space carries search + month. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="bills">
              Bills
              {billsTotals.count > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({billsTotals.count})
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="expenses">
              Expenses
              {expensesTotals.count > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({expensesTotals.count})
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList>
          <ExpenseFilters
            months={monthOptions}
            month={selectedMonth ?? "all"}
            q={search}
            category={selectedCategory ?? "all"}
            categories={Object.entries(EXPENSE_FILTER_CATEGORIES).map(
              ([value, label]) => ({ value, label }),
            )}
            sub={selectedSub ?? "all"}
            subOptions={subOptions}
            tab={activeTab}
          />
        </div>

        {/* ── Bills tab ── */}
        <TabsContent value="bills" className="space-y-3">
          <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b border-border">
                  <tr className="text-left">
                    <th className="px-3 py-3 font-semibold">Date Paid</th>
                    <th className="px-3 py-3 font-semibold">Bill Account</th>
                    <th className="px-3 py-3 font-semibold">Due Date</th>
                    <th className="px-3 py-3 font-semibold">Description</th>
                    <th className="px-3 py-3 font-semibold text-right">Units</th>
                    <th className="px-3 py-3 font-semibold text-right">Amount</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {bills.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                        {search || selectedMonth ? (
                          <>No bills found — {scopeLabel}.</>
                        ) : (
                          <>
                            No bills recorded yet. Click{" "}
                            <span className="font-medium text-foreground">Add Bill</span> to get started.
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                  {bills.map((e) => {
                    const acct = e.bill_account_id
                      ? billAccountMap.get(e.bill_account_id)
                      : null;
                    return (
                      <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                        <td className="px-3 py-3 whitespace-nowrap">
                          {formatDate(e.expense_date)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {acct ? (
                            <div>
                              <div className="font-medium">{acct.nickname}</div>
                              <div className="text-xs text-muted-foreground">{acct.account_number}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">{e.vendor ?? "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {e.due_date ? (
                            <span className={e.due_date < e.expense_date ? "text-destructive font-medium" : ""}>
                              {formatDate(e.due_date)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-3 min-w-[180px] text-muted-foreground">
                          {e.description || "—"}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {e.units_consumed != null ? e.units_consumed : "—"}
                        </td>
                        <td className="px-3 py-3 font-semibold text-right whitespace-nowrap">
                          {formatCurrency(Number(e.amount))}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <ExpenseRowActions buildingId={buildingId} expense={expenseRowProps(e)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {truncationNote(bills.length, billsTotals)}
        </TabsContent>

        {/* ── Expenses tab ── */}
        <TabsContent value="expenses" className="space-y-3">
          <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b border-border">
                  <tr className="text-left">
                    <th className="px-3 py-3 font-semibold">Date</th>
                    <th className="px-3 py-3 font-semibold">Category</th>
                    <th className="px-3 py-3 font-semibold">Description</th>
                    <th className="px-3 py-3 font-semibold">Vendor</th>
                    <th className="px-3 py-3 font-semibold text-right">Amount</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                        {selectedCategory || selectedSub || selectedMonth || search
                          ? `No expenses found — ${scopeLabel}.`
                          : <>No expenses recorded yet. Click <span className="font-medium text-foreground">Add Expense</span> to get started.</>}
                      </td>
                    </tr>
                  )}
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                      <td className="px-3 py-3 whitespace-nowrap">{formatDate(e.expense_date)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-secondary border border-border">
                          {EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}
                        </span>
                        {e.subcategory && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {prettifyExpenseSubcategory(e.subcategory)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 min-w-[220px]">{e.description}</td>
                      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                        {e.vendor ?? "—"}
                      </td>
                      <td className="px-3 py-3 font-semibold text-right whitespace-nowrap">
                        {formatCurrency(Number(e.amount))}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <ExpenseRowActions buildingId={buildingId} expense={expenseRowProps(e)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {truncationNote(expenses.length, expensesTotals)}
        </TabsContent>

        {/* ── Summary tab ── */}
        <TabsContent value="summary">
          {/* Headline totals already sit above the tabs — this tab breaks the
              expense side down by category, over the same filtered scope. */}
          <p className="text-sm text-muted-foreground mb-3">
            Expenses by category — {scopeLabel}
            {month && (
              <>
                {" "}
                ({formatDate(month.start)} – {formatDate(month.end)})
              </>
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(EXPENSE_FILTER_CATEGORIES)
              // With a category filter on, the other cards would all read zero.
              .filter(([k]) => !selectedCategory || k === selectedCategory)
              .map(([k, v]) => (
                <div key={k} className="card-soft">
                  <div className="text-muted-foreground text-sm">{v}</div>
                  <div className="text-2xl font-semibold mt-1">
                    {formatCurrency(groups.get(k) ?? 0)}
                  </div>
                </div>
              ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Staff salaries are tracked separately in{" "}
            <Link href="/admin/staff" className="text-primary hover:underline">
              Staff
            </Link>
            .
          </p>
        </TabsContent>
      </Tabs>
    </>
  );
}
