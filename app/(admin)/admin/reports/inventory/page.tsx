import { Suspense } from "react";
import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { rangeFromSearchParams } from "@/lib/reports/date-range";
import { getInventoryReport } from "@/app/actions/inventory";
import { ReportTabs } from "@/components/admin/reports/report-tabs";
import { ReportSkeleton } from "@/components/admin/reports/report-skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Package, AlertTriangle, TrendingDown, DollarSign,
  ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal,
} from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string }>;

export default function InventoryReportPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="space-y-1">
        <h1>Reports</h1>
        <p className="text-muted-foreground text-sm">
          Accountant-grade reports — live preview, column picker, CSV and PDF.
        </p>
      </div>
      <ReportTabs active="inventory" />
      <Suspense fallback={<ReportSkeleton />}>
        <InventoryReportData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function InventoryReportData({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireRole(["admin", "super_admin", "accountant"]);
  if (!profile.building_id) {
    return <p className="text-sm text-muted-foreground">No building assigned.</p>;
  }

  const sp = await searchParams;
  const dateRange = rangeFromSearchParams(sp);
  const buildingName = (await getCurrentBuildingName()) ?? "Building";

  const { items, transactions } = await getInventoryReport(dateRange.from, dateRange.to);

  // Finance calculations
  const totalValue   = items.reduce((s, i) => s + i.current_stock * i.unit_cost, 0);
  const lowStock     = items.filter((i) => i.min_stock > 0 && i.current_stock <= i.min_stock);
  const outStock     = items.filter((i) => i.current_stock === 0);
  const purchaseCost = transactions
    .filter((t) => t.type === "in")
    .reduce((s, t) => s + t.quantity * t.unit_cost, 0);
  const usageCost    = transactions
    .filter((t) => t.type === "out")
    .reduce((s, t) => s + t.quantity * t.unit_cost, 0);

  const TX_ICON: Record<string, React.ReactNode> = {
    in:         <ArrowDownToLine className="w-3 h-3 text-success" />,
    out:        <ArrowUpFromLine className="w-3 h-3 text-destructive" />,
    adjustment: <SlidersHorizontal className="w-3 h-3 text-primary" />,
  };
  const TX_COLOR: Record<string, string> = {
    in: "text-success", out: "text-destructive", adjustment: "text-primary",
  };

  return (
    <div className="space-y-6">
      {/* Date range selector (reuse existing pattern) */}
      <div className="text-xs text-muted-foreground">
        Showing: <span className="font-medium text-foreground">{dateRange.from}</span> to <span className="font-medium text-foreground">{dateRange.to}</span>
        {" · "}<a href="?" className="text-primary hover:underline">Reset</a>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs text-muted-foreground font-medium">Total Stock Value</p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(totalValue)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{items.length} items on hand</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownToLine className="w-3.5 h-3.5 text-success" />
            <p className="text-xs text-muted-foreground font-medium">Purchases (period)</p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(purchaseCost)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {transactions.filter((t) => t.type === "in").length} restock{transactions.filter((t) => t.type === "in").length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpFromLine className="w-3.5 h-3.5 text-destructive" />
            <p className="text-xs text-muted-foreground font-medium">Usage Cost (period)</p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(usageCost)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {transactions.filter((t) => t.type === "out").length} issue{transactions.filter((t) => t.type === "out").length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className={`rounded-xl border p-4 ${lowStock.length > 0 ? "border-amber-200 bg-amber-50" : "border-border bg-card"}`}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className={`w-3.5 h-3.5 ${lowStock.length > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
            <p className="text-xs text-muted-foreground font-medium">Low / Out of Stock</p>
          </div>
          <p className={`text-lg font-bold tabular-nums ${lowStock.length > 0 ? "text-amber-700" : "text-foreground"}`}>
            {lowStock.length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{outStock.length} completely out</p>
        </div>
      </div>

      {/* Stock Valuation Table */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Stock Valuation</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Category</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit Cost</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Value</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No inventory items found.
                    </td>
                  </tr>
                )}
                {items.map((item) => {
                  const val = item.current_stock * item.unit_cost;
                  const isLow = item.min_stock > 0 && item.current_stock <= item.min_stock;
                  const isOut = item.current_stock === 0;
                  return (
                    <tr key={item.id} className={`border-b border-border last:border-0 ${isLow ? "bg-amber-50/40" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        {item.location && (
                          <p className="text-xs text-muted-foreground">{item.location}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground capitalize hidden sm:table-cell">
                        {item.category}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">
                        <span className={isOut ? "text-destructive font-bold" : isLow ? "text-amber-600 font-semibold" : "text-foreground"}>
                          {item.current_stock}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                        {item.unit_cost > 0 ? `Rs. ${item.unit_cost.toLocaleString("en-PK")}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-foreground">
                        {val > 0 ? formatCurrency(val) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        {isOut ? (
                          <span className="status-overdue inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium">Out</span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 border border-amber-200 text-amber-700">
                            <AlertTriangle className="w-2.5 h-2.5" /> Low
                          </span>
                        ) : (
                          <span className="status-paid inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {totalValue > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-secondary/20">
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      Total inventory value
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(totalValue)}</span>
                    </td>
                    <td className="hidden sm:table-cell" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Stock Movement Log */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Stock Movements
          <span className="text-muted-foreground font-normal ml-2">({dateRange.from} – {dateRange.to})</span>
        </h2>

        {transactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No stock movements in this period.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/40">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Type</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Qty</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit Cost</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const itemRel = tx.bms_inventory_items;
                    const itemObj = Array.isArray(itemRel) ? itemRel[0] : itemRel;
                    const txAmount = tx.quantity * tx.unit_cost;
                    return (
                      <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {formatDate(tx.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground">{itemObj?.name ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold capitalize ${TX_COLOR[tx.type]}`}>
                            {TX_ICON[tx.type]}
                            {tx.type === "in" ? "Restock" : tx.type === "out" ? "Usage" : "Adjustment"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums">
                          <span className={TX_COLOR[tx.type]}>
                            {tx.type === "in" ? "+" : tx.type === "out" ? "-" : "="}{tx.quantity}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">{itemObj?.unit ?? ""}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                          {tx.unit_cost > 0 ? `Rs. ${tx.unit_cost.toLocaleString("en-PK")}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">
                          {txAmount > 0 ? (
                            <span className={tx.type === "in" ? "text-destructive" : tx.type === "out" ? "text-success" : "text-foreground"}>
                              {tx.type === "in" ? "-" : tx.type === "out" ? "+" : ""}{formatCurrency(txAmount)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                          {tx.reason ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals footer */}
                <tfoot>
                  <tr className="border-t-2 border-border bg-secondary/20">
                    <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      Period: Purchases (cash out) / Usage recovered value
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        {purchaseCost > 0 && (
                          <span className="text-xs font-semibold text-destructive tabular-nums">-{formatCurrency(purchaseCost)}</span>
                        )}
                        {usageCost > 0 && (
                          <span className="text-xs font-semibold text-success tabular-nums">+{formatCurrency(usageCost)}</span>
                        )}
                      </div>
                    </td>
                    <td className="hidden md:table-cell" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {buildingName} · Inventory Report · Generated {new Date().toLocaleDateString("en-PK", { dateStyle: "long" })}
      </p>
    </div>
  );
}
