import { ArrowDownCircle, ArrowUpCircle, Wallet, TrendingUp } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatLakh, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function UnionFinancePage() {
  const { profile } = await requireRole("union");
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Finance</h1>
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  const supabase = await createClient();
  const building_id = profile.building_id;

  // Building (fund balance)
  const { data: building } = await supabase
    .from("bms_buildings")
    .select("name, fund_balance")
    .eq("id", building_id)
    .single();

  // Monthly window
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

  // Inflows: payments this month
  const { data: paymentsMonth } = await supabase
    .from("bms_payments")
    .select("amount")
    .eq("building_id", building_id)
    .gte("payment_date", monthStart)
    .lt("payment_date", monthEnd);
  const inflowMonth = (paymentsMonth ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);

  // Outflows: expenses this month
  const { data: expensesMonth } = await supabase
    .from("bms_expenses")
    .select("amount")
    .eq("building_id", building_id)
    .gte("expense_date", monthStart)
    .lt("expense_date", monthEnd);
  const outflowMonth = (expensesMonth ?? []).reduce((s, e) => s + Number(e.amount ?? 0), 0);

  // Outstanding dues
  const { data: flats } = await supabase
    .from("bms_flats")
    .select("outstanding_dues")
    .eq("building_id", building_id);
  const outstanding = (flats ?? []).reduce((s, f) => s + Number(f.outstanding_dues ?? 0), 0);

  // Recent transactions: combine last 5 payments and last 5 expenses
  const { data: recentPayments } = await supabase
    .from("bms_payments")
    .select("id, amount, payment_date, category, reference_no")
    .eq("building_id", building_id)
    .order("payment_date", { ascending: false })
    .limit(5);

  const { data: recentExpenses } = await supabase
    .from("bms_expenses")
    .select("id, amount, expense_date, category, description")
    .eq("building_id", building_id)
    .order("expense_date", { ascending: false })
    .limit(5);

  return (
    <div className="space-y-6 animate-fade-up">
      <header>
        <h1>Building finance</h1>
        <p className="text-muted-foreground mt-1">
          Read-only snapshot of the fund. Same numbers your admin sees.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Wallet className="w-6 h-6" />}
          label="Fund balance"
          value={formatLakh(Number(building?.fund_balance ?? 0))}
          color="bg-blue-100 text-blue-700"
        />
        <KpiCard
          icon={<ArrowUpCircle className="w-6 h-6" />}
          label="Collected this month"
          value={formatCurrency(inflowMonth)}
          color="bg-green-100 text-green-700"
        />
        <KpiCard
          icon={<ArrowDownCircle className="w-6 h-6" />}
          label="Spent this month"
          value={formatCurrency(outflowMonth)}
          color="bg-red-100 text-red-700"
        />
        <KpiCard
          icon={<TrendingUp className="w-6 h-6" />}
          label="Outstanding dues"
          value={formatCurrency(outstanding)}
          color="bg-amber-100 text-amber-700"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-soft">
          <h3 className="text-xl font-bold mb-3">Recent payments in</h3>
          {(recentPayments ?? []).length === 0 ? (
            <p className="text-muted-foreground">No payments recorded.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(recentPayments ?? []).map((p) => (
                <li key={p.id} className="py-3 flex justify-between gap-3">
                  <div>
                    <div className="font-medium">{p.category ?? "Maintenance"}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(p.payment_date)}
                      {p.reference_no ? ` · Ref ${p.reference_no}` : ""}
                    </div>
                  </div>
                  <div className="font-semibold text-green-700">
                    +{formatCurrency(Number(p.amount))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-soft">
          <h3 className="text-xl font-bold mb-3">Recent expenses out</h3>
          {(recentExpenses ?? []).length === 0 ? (
            <p className="text-muted-foreground">No expenses recorded.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(recentExpenses ?? []).map((e) => (
                <li key={e.id} className="py-3 flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(e.expense_date)} · {e.category}
                    </div>
                  </div>
                  <div className="font-semibold text-red-700">
                    -{formatCurrency(Number(e.amount))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="card-soft">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm uppercase tracking-wide text-muted-foreground font-medium">
            {label}
          </div>
          <div className="text-3xl font-bold mt-1 truncate">{value}</div>
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
