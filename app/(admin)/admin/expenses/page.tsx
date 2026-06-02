import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { formatCurrency, formatDate, getMonthRange } from "@/lib/utils";
import { AddExpenseButton } from "@/components/admin/expenses/add-expense-button";
import { ExpenseRowActions } from "@/components/admin/expenses/expense-row-actions";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

// Salaries are tracked separately in /admin/staff (bms_salary_payments).
// "salaries" kept in this map so any legacy rows still render with a label.
const CATEGORY_LABELS: Record<string, string> = {
  utilities: "Utilities",
  repairs: "Repairs",
  supplies: "Supplies",
  other: "Other",
  salaries: "Salaries (legacy)",
};

// Filter pills only show active categories (no salaries).
const FILTER_CATEGORIES: Record<string, string> = {
  utilities: "Utilities",
  repairs: "Repairs",
  supplies: "Supplies",
  other: "Other",
};

// Friendly labels for known subcategory slugs. Anything not in the map falls
// back to a generic snake_case → "Title Case" prettifier below.
const SUBCATEGORY_LABELS: Record<string, string> = {
  // Utilities (both old + new naming so existing rows render nicely)
  corridor_electricity: "Corridor Electricity",
  electricity_corridor: "Corridor Electricity",
  water_motor:          "Water Motor",
  lift_service:         "Lift Service",
  generator_diesel:     "Generator Diesel",
  generator_oil:        "Generator Oil",
  internet:             "Internet / Wi-Fi",
  gas:                  "Gas",
  water_supply:         "Water Supply",
  // Repairs
  bulbs:        "Bulbs / LEDs",
  wiring:       "Electrical Wiring",
  plumbing:     "Plumbing",
  led_panels:   "LED Panels",
  painting:     "Painting",
  lift_repair:  "Lift Repair",
  lift:         "Lift Repair",
  generator:    "Generator Service",
  pest_control: "Pest Control",
  pest:         "Pest Control",
  carpentry:    "Carpentry",
  roof_leak:    "Roof / Tank Leak",
  // Salaries
  chowkidar:      "Chowkidar Salary",
  sweeper:        "Sweeper Salary",
  lift_operator:  "Lift Operator Salary",
  generator_tech: "Generator Tech Salary",
  bonus:          "Bonus / Eidi",
  overtime:       "Overtime",
  // Supplies
  cleaning:   "Cleaning Supplies",
  paint:      "Paint Supplies",
  stationery: "Stationery",
  hardware:   "Hardware / Tools",
};

function prettifySubcategory(s: string | null | undefined): string {
  if (!s) return "";
  if (SUBCATEGORY_LABELS[s]) return SUBCATEGORY_LABELS[s];
  // generic fallback for custom values: replace _ with space + Title Case
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

type SearchParams = Promise<{ category?: string; from?: string; to?: string }>;

export default function ExpensesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="space-y-6 animate-fade-up">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <ExpensesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ExpensesContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  const sp = await searchParams;
  const supabase = await createClient();

  const month = getMonthRange();

  let query = supabase
    .from("bms_expenses")
    .select("*")
    .eq("building_id", buildingId)
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
    .eq("building_id", buildingId)
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
    <>
    <div className="flex items-center justify-between gap-3 mb-2">
      <h1>Expenses</h1>
      <AddExpenseButton buildingId={buildingId} />
    </div>
    <Tabs defaultValue="list">
      <TabsList>
        <TabsTrigger value="list">All expenses</TabsTrigger>
        <TabsTrigger value="month">This month by category</TabsTrigger>
      </TabsList>

      <TabsContent value="list" className="space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-sm text-muted-foreground mr-1">Filter:</span>
          <Link
            href="/admin/expenses"
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${
              !sp.category
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}
          >
            All
          </Link>
          {Object.entries(FILTER_CATEGORIES).map(([k, v]) => (
            <Link
              key={k}
              href={`/admin/expenses?category=${k}`}
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
                {list.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                      No expenses recorded yet.
                    </td>
                  </tr>
                )}
                {list.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                    <td className="px-3 py-3 whitespace-nowrap">
                      {formatDate(e.expense_date)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-secondary border border-border">
                        {CATEGORY_LABELS[e.category] ?? e.category}
                      </span>
                      {e.subcategory && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {prettifySubcategory(e.subcategory)}
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
                      <ExpenseRowActions
                        buildingId={buildingId}
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
                          is_bill: e.is_bill,
                          bank_account_id: e.bank_account_id,
                          bill_account_id: e.bill_account_id,
                          units_consumed: e.units_consumed ?? null,
                          due_date: e.due_date ?? null,
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
          {Object.entries(FILTER_CATEGORIES).map(([k, v]) => (
            <div key={k} className="card-soft">
              <div className="text-muted-foreground">{v}</div>
              <div className="text-2xl font-semibold mt-1">
                {formatCurrency(groups.get(k) ?? 0)}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Staff salaries are tracked separately in{" "}
          <Link href="/admin/staff" className="text-primary hover:underline">
            /admin/staff
          </Link>
          .
        </p>
      </TabsContent>
    </Tabs>
    </>
  );
}
