import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, getMonthRange } from "@/lib/utils";
import { AddExpenseButton } from "@/components/admin/expenses/add-expense-button";
import { ExpenseRowActions } from "@/components/admin/expenses/expense-row-actions";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  utilities: "Utilities",
  repairs: "Repairs",
  salaries: "Salaries",
  supplies: "Supplies",
  other: "Other",
};

type SearchParams = Promise<{ category?: string; from?: string; to?: string }>;

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const sp = await searchParams;
  const supabase = await createClient();

  const month = getMonthRange();

  let query = supabase
    .from("bms_expenses")
    .select("*")
    .eq("building_id", profile.building_id)
    .order("expense_date", { ascending: false });

  if (sp.category) query = query.eq("category", sp.category);
  if (sp.from) query = query.gte("expense_date", sp.from);
  if (sp.to) query = query.lte("expense_date", sp.to);

  const { data: expenses } = await query;
  const list = expenses ?? [];

  // Month grouping
  const { data: thisMonth } = await supabase
    .from("bms_expenses")
    .select("category,amount")
    .eq("building_id", profile.building_id)
    .gte("expense_date", month.start)
    .lte("expense_date", month.end);

  const groups = new Map<string, number>();
  let monthTotal = 0;
  (thisMonth ?? []).forEach((e) => {
    const v = groups.get(e.category) ?? 0;
    groups.set(e.category, v + Number(e.amount));
    monthTotal += Number(e.amount);
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1>Expenses</h1>
          <p className="text-muted-foreground mt-1">
            This month: {formatCurrency(monthTotal)}
          </p>
        </div>
        <AddExpenseButton />
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">All expenses</TabsTrigger>
          <TabsTrigger value="month">This month by category</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="card-soft p-0 overflow-hidden">
            <div className="p-4 flex gap-2 flex-wrap items-center bg-secondary/50 border-b">
              <span className="text-sm font-medium">Filter:</span>
              <Link
                href="/admin/expenses"
                className={`text-sm px-3 py-1 rounded-full border ${!sp.category ? "bg-primary text-primary-foreground" : "bg-white"}`}
              >
                All
              </Link>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <Link
                  key={k}
                  href={`/admin/expenses?category=${k}`}
                  className={`text-sm px-3 py-1 rounded-full border ${sp.category === k ? "bg-primary text-primary-foreground" : "bg-white"}`}
                >
                  {v}
                </Link>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary text-left">
                  <tr>
                    <th className="px-4 py-3 text-sm font-semibold">Date</th>
                    <th className="px-4 py-3 text-sm font-semibold">Category</th>
                    <th className="px-4 py-3 text-sm font-semibold">Description</th>
                    <th className="px-4 py-3 text-sm font-semibold">Vendor</th>
                    <th className="px-4 py-3 text-sm font-semibold text-right">Amount</th>
                    <th className="px-4 py-3 text-sm font-semibold"></th>
                    <th className="px-4 py-3 text-sm font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        No expenses recorded yet.
                      </td>
                    </tr>
                  )}
                  {list.map((e) => (
                    <tr key={e.id} className="border-t hover:bg-secondary/40">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDate(e.expense_date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-secondary border">
                          {CATEGORY_LABELS[e.category] ?? e.category}
                        </span>
                        {e.subcategory && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {e.subcategory}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">{e.description}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {e.vendor ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-right">
                        {formatCurrency(Number(e.amount))}
                      </td>
                      <td className="px-4 py-3">
                        {e.is_recurring && (
                          <span className="status-info px-2 py-0.5 rounded-full text-xs">
                            {e.recurrence}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ExpenseRowActions
                          expense={{
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
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="month">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="card-soft">
              <div className="text-muted-foreground">Total this month</div>
              <div className="text-3xl font-bold mt-1">
                {formatCurrency(monthTotal)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatDate(month.start)} – {formatDate(month.end)}
              </div>
            </div>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <div key={k} className="card-soft">
                <div className="text-muted-foreground">{v}</div>
                <div className="text-2xl font-semibold mt-1">
                  {formatCurrency(groups.get(k) ?? 0)}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
