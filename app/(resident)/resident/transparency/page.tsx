import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatLakh, capitalize } from "@/lib/utils";
import { IncomeExpenseBarChart, ExpenseCategoryPie } from "@/components/resident/finance-charts";
import { StatementDownload } from "@/components/resident/statement-download";
import { TrendingUp, TrendingDown, Scale } from "lucide-react";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date) {
  return d.toLocaleString("en-PK", { month: "short", year: "2-digit" });
}

export default async function ResidentTransparencyPage() {
  const { profile } = await requireRole("resident");
  const supabase = await createClient();

  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Building Finance</h1>
        <p className="text-muted-foreground mt-2">No building assigned to your account.</p>
      </div>
    );
  }

  const { data: building } = await supabase
    .from("bms_buildings")
    .select("id, name, address, city, fund_balance")
    .eq("id", profile.building_id)
    .maybeSingle();

  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const last12Start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const last12StartIso = last12Start.toISOString().slice(0, 10);
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [
    { data: ytdPayments },
    { data: ytdExpenses },
    { data: recentPayments },
    { data: recentExpenses },
    { data: monthExpenses },
    { data: recentExpenseRows },
  ] = await Promise.all([
    supabase
      .from("bms_payments")
      .select("amount, payment_date")
      .eq("building_id", profile.building_id)
      .gte("payment_date", yearStart),
    supabase
      .from("bms_expenses")
      .select("amount, expense_date")
      .eq("building_id", profile.building_id)
      .gte("expense_date", yearStart),
    supabase
      .from("bms_payments")
      .select("amount, payment_date")
      .eq("building_id", profile.building_id)
      .gte("payment_date", last12StartIso),
    supabase
      .from("bms_expenses")
      .select("amount, expense_date")
      .eq("building_id", profile.building_id)
      .gte("expense_date", last12StartIso),
    supabase
      .from("bms_expenses")
      .select("amount, category")
      .eq("building_id", profile.building_id)
      .gte("expense_date", monthStart),
    supabase
      .from("bms_expenses")
      .select("expense_date, category, subcategory, description, amount, vendor")
      .eq("building_id", profile.building_id)
      .order("expense_date", { ascending: false })
      .limit(20),
  ]);

  const totalIncomeYTD = (ytdPayments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenseYTD = (ytdExpenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const netYTD = totalIncomeYTD - totalExpenseYTD;

  // monthly buckets — last 12 months
  const months: { key: string; label: string; income: number; expense: number; date: Date }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: monthLabel(d), income: 0, expense: 0, date: d });
  }
  const monthIdx = new Map(months.map((m, i) => [m.key, i]));
  for (const p of recentPayments ?? []) {
    if (!p.payment_date) continue;
    const d = new Date(p.payment_date);
    const idx = monthIdx.get(monthKey(d));
    if (idx != null) months[idx].income += Number(p.amount);
  }
  for (const e of recentExpenses ?? []) {
    if (!e.expense_date) continue;
    const d = new Date(e.expense_date);
    const idx = monthIdx.get(monthKey(d));
    if (idx != null) months[idx].expense += Number(e.amount);
  }
  const barChartData = months.map((m) => ({
    month: m.label,
    income: Math.round(m.income),
    expense: Math.round(m.expense),
  }));

  // pie data — this month's expenses by category
  const catMap = new Map<string, number>();
  for (const e of monthExpenses ?? []) {
    const k = e.category || "other";
    catMap.set(k, (catMap.get(k) ?? 0) + Number(e.amount));
  }
  const pieData = Array.from(catMap.entries())
    .map(([category, amount]) => ({ category: capitalize(category), amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount);

  type ExpenseRow = {
    expense_date: string | null;
    category: string;
    subcategory: string | null;
    description: string;
    amount: number;
    vendor: string | null;
  };
  const recent = (recentExpenseRows ?? []) as ExpenseRow[];

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1>Where your money goes</h1>
        <p className="text-lg text-muted-foreground mt-2">
          Full visibility into the building&apos;s income and expenses.
        </p>
      </div>

      {/* Fund balance hero */}
      <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-primary/10 p-8">
        <div className="text-base text-muted-foreground">Current Building Fund Balance</div>
        <div className="text-6xl font-extrabold mt-2 text-[hsl(220_85%_30%)]">
          {formatLakh(Number(building?.fund_balance ?? 0))}
        </div>
        <div className="text-sm text-muted-foreground mt-2">
          Total balance held by {building?.name ?? "the building"}.
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-soft">
          <div className="flex items-center gap-2 text-muted-foreground text-base">
            <TrendingUp className="w-5 h-5 text-[hsl(151_70%_28%)]" />
            <span>Income (this year)</span>
          </div>
          <div className="text-4xl font-extrabold mt-3 text-[hsl(151_70%_28%)]">
            {formatCurrency(totalIncomeYTD)}
          </div>
        </div>
        <div className="card-soft">
          <div className="flex items-center gap-2 text-muted-foreground text-base">
            <TrendingDown className="w-5 h-5 text-destructive" />
            <span>Expense (this year)</span>
          </div>
          <div className="text-4xl font-extrabold mt-3 text-destructive">
            {formatCurrency(totalExpenseYTD)}
          </div>
        </div>
        <div className="card-soft">
          <div className="flex items-center gap-2 text-muted-foreground text-base">
            <Scale className="w-5 h-5" />
            <span>Net (this year)</span>
          </div>
          <div className={`text-4xl font-extrabold mt-3 ${netYTD >= 0 ? "text-[hsl(151_70%_28%)]" : "text-destructive"}`}>
            {formatCurrency(netYTD)}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-soft">
          <h2 className="text-xl font-semibold">Income vs Expense (last 12 months)</h2>
          <p className="text-sm text-muted-foreground mt-1">Green = money in. Red = money out.</p>
          <div className="mt-4">
            <IncomeExpenseBarChart data={barChartData} />
          </div>
        </div>
        <div className="card-soft">
          <h2 className="text-xl font-semibold">This Month&apos;s Expenses by Category</h2>
          <p className="text-sm text-muted-foreground mt-1">
            How {formatDate(monthStart)} expenses split across categories.
          </p>
          <div className="mt-4">
            <ExpenseCategoryPie data={pieData} />
          </div>
        </div>
      </div>

      {/* Statement download */}
      <div className="card-soft">
        <h2 className="text-xl font-semibold">Monthly Statement</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Download a PDF of all income and expenses for any month.
        </p>
        <div className="mt-4">
          <StatementDownload
            buildingId={profile.building_id}
            buildingName={building?.name ?? "Building"}
            buildingAddress={building?.address ?? null}
            buildingCity={building?.city ?? null}
          />
        </div>
      </div>

      {/* Recent Expenses */}
      <div>
        <h2 className="text-2xl font-semibold mb-3">Recent Expenses</h2>
        {recent.length === 0 ? (
          <div className="card-soft text-base text-muted-foreground">No expenses recorded yet.</div>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-base">
              <thead className="bg-secondary text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e, i) => (
                  <tr key={i} className="border-t hover:bg-secondary/40">
                    <td className="px-4 py-4 whitespace-nowrap">
                      {e.expense_date ? formatDate(e.expense_date) : "—"}
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-block px-3 py-1 rounded-full bg-secondary text-sm font-medium">
                        {capitalize(e.category)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium">{e.description}</div>
                      {e.subcategory && (
                        <div className="text-xs text-muted-foreground">{e.subcategory}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{e.vendor ?? "—"}</td>
                    <td className="px-4 py-4 text-right font-semibold">
                      {formatCurrency(Number(e.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
