import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { getInventoryItems } from "@/app/actions/inventory";
import { AddItemDialog } from "@/components/admin/inventory/add-item-dialog";
import { InventoryTable } from "@/components/admin/inventory/inventory-table";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import { formatCurrency } from "@/lib/utils";
import { Package, AlertTriangle, TrendingDown, DollarSign } from "lucide-react";

export const dynamic = "force-dynamic";

export default function InventoryPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1>Inventory</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track building supplies, equipment stock, and total asset value.
          </p>
        </div>
        <AddItemDialog />
      </div>

      <Suspense fallback={<TableSkeleton rows={5} />}>
        <InventoryContent />
      </Suspense>
    </div>
  );
}

async function InventoryContent() {
  await requireRole(["admin", "super_admin"]);
  const { data: items, error } = await getInventoryItems();

  if (error) return <p className="text-sm text-destructive px-1">{error}</p>;

  const total      = items.length;
  const lowStock   = items.filter((i) => i.min_stock > 0 && i.current_stock <= i.min_stock);
  const outStock   = items.filter((i) => i.current_stock === 0);
  const totalValue = items.reduce((s, i) => s + i.current_stock * i.unit_cost, 0);

  return (
    <>
      {/* Stats strip */}
      {total > 0 && (
        <div className="flex flex-wrap gap-2 -mt-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary border border-border text-muted-foreground">
            <Package className="w-3.5 h-3.5" />
            {total} item{total !== 1 ? "s" : ""}
          </span>
          {totalValue > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 border border-primary/25 text-primary">
              <DollarSign className="w-3.5 h-3.5" />
              {formatCurrency(totalValue)} total value
            </span>
          )}
          {lowStock.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5" />
              {lowStock.length} low stock
            </span>
          )}
          {outStock.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 border border-red-200 text-red-700">
              <TrendingDown className="w-3.5 h-3.5" />
              {outStock.length} out of stock
            </span>
          )}
        </div>
      )}

      {/* Low-stock alert banner */}
      {lowStock.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-800">
              {lowStock.length} item{lowStock.length !== 1 ? "s need" : " needs"} restocking
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {lowStock.map((i) => i.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      <InventoryTable items={items} />
    </>
  );
}
