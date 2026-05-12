import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFinanceSummary } from "@/app/actions/finance";
import { formatCurrency, formatLakh } from "@/lib/utils";
import {
  IncomeExpenseChart,
  ExpenseBreakdownChart,
} from "@/components/admin/finance/finance-charts";
import { MonthlyStatementButton } from "@/components/admin/finance/monthly-statement-button";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Finance</h1>
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const summary = await getFinanceSummary();
  const { data: building } = await supabase
    .from("bms_buildings")
    .select("name")
    .eq("id", profile.building_id)
    .single();

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1>Finance</h1>
          <p className="text-muted-foreground">Income, expenses and fund balance.</p>
        </div>
        <MonthlyStatementButton
          data={{
            building_name: building?.name ?? "Building",
            monthly: summary.monthly,
            income_ytd: summary.income_ytd,
            expense_ytd: summary.expense_ytd,
            net_ytd: summary.net_ytd,
            fund_balance: summary.fund_balance,
          }}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Income YTD</div>
          <div className="mt-1 text-2xl font-bold text-[hsl(151_70%_28%)]">
            {formatLakh(summary.income_ytd)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {formatCurrency(summary.income_ytd)}
          </div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Expense YTD</div>
          <div className="mt-1 text-2xl font-bold text-destructive">
            {formatLakh(summary.expense_ytd)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {formatCurrency(summary.expense_ytd)}
          </div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Net P&L YTD</div>
          <div
            className={`mt-1 text-2xl font-bold ${
              summary.net_ytd >= 0 ? "text-[hsl(151_70%_28%)]" : "text-destructive"
            }`}
          >
            {formatLakh(summary.net_ytd)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {formatCurrency(summary.net_ytd)}
          </div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Fund balance</div>
          <div className="mt-1 text-2xl font-bold">{formatLakh(summary.fund_balance)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {formatCurrency(summary.fund_balance)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-soft">
          <h3 className="mb-3">Income vs Expense — Last 12 months</h3>
          <IncomeExpenseChart data={summary.monthly} />
        </div>
        <div className="card-soft">
          <h3 className="mb-3">Expense breakdown — This month</h3>
          <ExpenseBreakdownChart data={summary.expense_breakdown} />
        </div>
      </div>

      <div className="card-soft">
        <h3 className="mb-3">Monthly summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-2 font-semibold">Month</th>
                <th className="px-4 py-2 font-semibold text-right">Income</th>
                <th className="px-4 py-2 font-semibold text-right">Expense</th>
                <th className="px-4 py-2 font-semibold text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {summary.monthly.map((m) => (
                <tr key={m.month} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{m.month}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(m.income)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(m.expense)}</td>
                  <td
                    className={`px-4 py-2 text-right font-semibold ${
                      m.net >= 0 ? "text-[hsl(151_70%_28%)]" : "text-destructive"
                    }`}
                  >
                    {formatCurrency(m.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
