import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ProposeButton } from "@/components/union/propose-button";

export const dynamic = "force-dynamic";

export default async function UnionExpensesPage() {
  const { profile } = await requireRole("union");
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Expenses</h1>
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  const supabase = await createClient();

  const { data: expenses } = await supabase
    .from("bms_expenses")
    .select("id, category, subcategory, description, amount, expense_date, vendor, proposal_id")
    .eq("building_id", profile.building_id)
    .order("expense_date", { ascending: false })
    .limit(100);

  const total = (expenses ?? []).reduce((s, e) => s + Number(e.amount ?? 0), 0);

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>Expenses</h1>
          <p className="text-muted-foreground mt-1">
            Recent building expenses. To spend from the fund, raise a proposal — the committee must
            approve before money moves.
          </p>
        </div>
        <ProposeButton
          proposal_type="expense"
          buttonLabel="Propose expense"
          dialogTitle="Propose a new expense"
          dialogDescription="Describe the expense and amount. Union members vote before it is recorded."
          showAmount
        />
      </header>

      <div className="card-soft">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xl font-bold">Last 100 entries</h3>
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground font-medium">Sum shown</div>
            <div className="text-2xl font-bold">{formatCurrency(total)}</div>
          </div>
        </div>
      </div>

      <div className="card-soft p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-secondary text-sm uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {(expenses ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No expenses recorded yet.
                </td>
              </tr>
            ) : (
              (expenses ?? []).map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-4 py-3 text-sm">{formatDate(e.expense_date)}</td>
                  <td className="px-4 py-3 font-medium">{e.description}</td>
                  <td className="px-4 py-3 text-sm">
                    {e.category}
                    {e.subcategory ? ` · ${e.subcategory}` : ""}
                  </td>
                  <td className="px-4 py-3 text-sm">{e.vendor ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatCurrency(Number(e.amount))}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {e.proposal_id ? (
                      <span className="status-paid px-2 py-0.5 rounded-full">From proposal</span>
                    ) : (
                      <span className="text-muted-foreground">Direct</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
