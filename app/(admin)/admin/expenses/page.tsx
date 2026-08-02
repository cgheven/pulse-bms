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
  getMonthRange,
} from "@/lib/utils";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_FILTER_CATEGORIES,
  prettifyExpenseSubcategory,
} from "@/lib/expense-constants";
import { AddExpenseButton } from "@/components/admin/expenses/add-expense-button";
import { ExpenseRowActions } from "@/components/admin/expenses/expense-row-actions";
import { ExpenseMonthFilter } from "@/components/admin/expenses/expense-month-filter";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ category?: string; tab?: string; month?: string }>;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

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
  // Summary falls back to the current month when nothing is picked.
  const month = selectedMonth ? getMonthBounds(selectedMonth) : getMonthRange();

  // Category + month filters are pushed to the DB so the .limit(500) cap is
  // applied after filtering, not before (avoids silently missing older rows
  // of a requested category/month).
  let billsQuery = supabase
    .from("bms_expenses")
    .select("*")
    .eq("building_id", buildingId)
    .eq("is_bill", true);

  let expensesQuery = supabase
    .from("bms_expenses")
    .select("*")
    .eq("building_id", buildingId)
    .or("is_bill.eq.false,is_bill.is.null");
  if (sp.category) {
    expensesQuery = expensesQuery.eq("category", sp.category);
  }
  if (selectedMonth) {
    billsQuery = billsQuery
      .gte("expense_date", month.start)
      .lte("expense_date", month.end);
    expensesQuery = expensesQuery
      .gte("expense_date", month.start)
      .lte("expense_date", month.end);
  }

  const [
    { data: billsRaw, error: billsErr },
    { data: expensesRaw, error: expensesErr },
    { data: billAccounts, error: baErr },
    { data: thisMonth, error: tmErr },
    { data: oldestRow },
    { data: newestRow },
  ] = await Promise.all([
    billsQuery.order("expense_date", { ascending: false }).limit(500),
    expensesQuery
      .order("expense_date", { ascending: false })
      .limit(500),
    supabase
      .from("bms_bill_accounts")
      .select("id, nickname, account_number, provider")
      .eq("building_id", buildingId),
    supabase
      .from("bms_expenses")
      .select("category, amount, is_bill")
      .eq("building_id", buildingId)
      .gte("expense_date", month.start)
      .lte("expense_date", month.end),
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
  if (baErr) console.error("[expenses] bill_accounts query failed:", baErr.message);
  if (tmErr) console.error("[expenses] this-month query failed:", tmErr.message);

  const bills = billsRaw ?? [];
  const expenses = expensesRaw ?? [];

  const billAccountMap = new Map(
    (billAccounts ?? []).map((b) => [b.id, b]),
  );

  // This-month summary — single pass over monthRows
  const monthRows = thisMonth ?? [];
  let billsTotal = 0;
  let expensesTotal = 0;
  const groups = new Map<string, number>();
  for (const e of monthRows) {
    const amt = Number(e.amount);
    if (e.is_bill) {
      billsTotal += amt;
    } else {
      expensesTotal += amt;
      groups.set(e.category, (groups.get(e.category) ?? 0) + amt);
    }
  }

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

  // Helper: build a category-filter URL that preserves the tab and month.
  const filterHref = (cat?: string) => {
    const params = new URLSearchParams({ tab: "expenses" });
    if (cat) params.set("category", cat);
    if (selectedMonth) params.set("month", selectedMonth);
    return `/admin/expenses?${params.toString()}`;
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1>Bills &amp; Expenses</h1>
        <div className="flex gap-2">
          <AddExpenseButton buildingId={buildingId} mode="bill" />
          <AddExpenseButton buildingId={buildingId} mode="expense" />
        </div>
      </div>

      {/* key forces Radix to remount on tab changes from URL navigation,
          because defaultValue is only consumed at initial mount and Next.js
          App Router reconciles client components in place without remounting. */}
      <Tabs key={activeTab} defaultValue={activeTab}>
        {/* Tabs and the month filter share one row — the tab pill is only as
            wide as its labels, so the leftover space carries the filter. */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <TabsList>
            <TabsTrigger value="bills">
              Bills
              {bills.length > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({bills.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="expenses">
              Expenses
              {expenses.length > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({expenses.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="summary">
              {selectedMonth ? formatMonthLabel(selectedMonth) : "This Month"}
            </TabsTrigger>
          </TabsList>
          <ExpenseMonthFilter
            months={monthOptions}
            value={selectedMonth ?? "all"}
            tab={activeTab}
            category={sp.category}
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
                        {selectedMonth ? (
                          <>No bills recorded in {formatMonthLabel(selectedMonth)}.</>
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
        </TabsContent>

        {/* ── Expenses tab ── */}
        <TabsContent value="expenses" className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-sm text-muted-foreground mr-1">Filter:</span>
            <Link
              href={filterHref()}
              className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                !sp.category
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >
              All
            </Link>
            {Object.entries(EXPENSE_FILTER_CATEGORIES).map(([k, v]) => (
              <Link
                key={k}
                href={filterHref(k)}
                className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                  sp.category === k
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}
              >
                {v}
              </Link>
            ))}
          </div>

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
                        {sp.category || selectedMonth
                          ? "No expenses match these filters."
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
        </TabsContent>

        {/* ── This Month summary tab ── */}
        <TabsContent value="summary">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="card-soft">
              <div className="text-muted-foreground text-sm">
                {selectedMonth
                  ? `Total — ${formatMonthLabel(selectedMonth)}`
                  : "Total this month"}
              </div>
              <div className="text-3xl font-bold mt-1">
                {formatCurrency(billsTotal + expensesTotal)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatDate(month.start)} – {formatDate(month.end)}
              </div>
            </div>
            <div className="card-soft">
              <div className="text-muted-foreground text-sm">Bills</div>
              <div className="text-2xl font-semibold mt-1">{formatCurrency(billsTotal)}</div>
            </div>
            <div className="card-soft">
              <div className="text-muted-foreground text-sm">Expenses</div>
              <div className="text-2xl font-semibold mt-1">{formatCurrency(expensesTotal)}</div>
            </div>
            {Object.entries(EXPENSE_FILTER_CATEGORIES).map(([k, v]) => (
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
