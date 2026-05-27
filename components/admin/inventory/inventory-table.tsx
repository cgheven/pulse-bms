"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  MoreHorizontal,
  History,
  Pencil,
  Trash2,
  MapPin,
  Package,
} from "lucide-react";
import { deleteInventoryItem, type InventoryItem } from "@/app/actions/inventory";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { StockMoveDialog } from "./stock-move-dialog";
import { ItemHistoryDrawer } from "./item-history-drawer";
import { EditItemDialog } from "./edit-item-dialog";

const CATEGORY_PILL: Record<string, string> = {
  cleaning:    "bg-sky-50 text-sky-700 border-sky-200",
  electrical:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  plumbing:    "bg-blue-50 text-blue-700 border-blue-200",
  safety:      "bg-red-50 text-red-700 border-red-200",
  tools:       "bg-orange-50 text-orange-700 border-orange-200",
  maintenance: "bg-purple-50 text-purple-700 border-purple-200",
  general:     "bg-secondary text-muted-foreground border-border",
};

function stockColor(item: InventoryItem): string {
  if (item.current_stock === 0) return "text-destructive font-bold";
  if (item.min_stock > 0 && item.current_stock <= item.min_stock) return "text-amber-600 font-semibold";
  return "text-success font-semibold";
}

function isLowStock(item: InventoryItem): boolean {
  return item.min_stock > 0 && item.current_stock <= item.min_stock;
}

interface ItemRowProps {
  item: InventoryItem;
  onDeleted: (id: string) => void;
}

function ItemRow({ item, onDeleted }: ItemRowProps) {
  const { toast } = useToast();
  const [moveDialog, setMoveDialog] = useState<"in" | "out" | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const low = isLowStock(item);
  const itemValue = item.current_stock * item.unit_cost;

  async function handleDelete() {
    if (!confirm(`Remove "${item.name}" from inventory?`)) return;
    setDeleting(true);
    try {
      await deleteInventoryItem(item.id);
      onDeleted(item.id);
      toast({ title: "Item removed" });
    } catch (err) {
      toast({
        title: "Failed",
        description: friendlyErrorMessage(err as Error),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <tr className={`group border-b border-border last:border-0 hover:bg-secondary/30 transition-colors ${low ? "bg-amber-50/40" : ""}`}>
        {/* Item */}
        <td className="px-4 py-3">
          <div className="flex items-start gap-2.5">
            {low && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground leading-snug">{item.name}</p>
              {item.location && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {item.location}
                </p>
              )}
            </div>
          </div>
        </td>

        {/* Category */}
        <td className="px-4 py-3 hidden sm:table-cell">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${CATEGORY_PILL[item.category] ?? CATEGORY_PILL.general}`}>
            {item.category}
          </span>
        </td>

        {/* Stock */}
        <td className="px-4 py-3 text-right">
          <div className="flex flex-col items-end">
            <span className={`text-sm tabular-nums ${stockColor(item)}`}>
              {item.current_stock}
              <span className="text-xs font-normal text-muted-foreground ml-1">{item.unit}</span>
            </span>
            {item.min_stock > 0 && (
              <span className="text-[10px] text-muted-foreground tabular-nums">min {item.min_stock}</span>
            )}
          </div>
        </td>

        {/* Unit Cost */}
        <td className="px-4 py-3 text-right hidden md:table-cell">
          <span className="text-xs tabular-nums text-muted-foreground">
            {item.unit_cost > 0 ? `Rs. ${item.unit_cost.toLocaleString("en-PK")}` : "—"}
          </span>
        </td>

        {/* Value */}
        <td className="px-4 py-3 text-right hidden md:table-cell">
          <span className={`text-xs font-semibold tabular-nums ${itemValue > 0 ? "text-foreground" : "text-muted-foreground"}`}>
            {itemValue > 0 ? formatCurrency(itemValue) : "—"}
          </span>
        </td>

        {/* Quick actions */}
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => setMoveDialog("in")}
              title="Restock"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-success bg-success/10 hover:bg-success/20 border border-success/20 transition-colors"
            >
              <ArrowDownToLine className="w-3 h-3" />
              <span className="hidden sm:inline">In</span>
            </button>
            <button
              onClick={() => setMoveDialog("out")}
              title="Use / Issue"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 transition-colors"
            >
              <ArrowUpFromLine className="w-3 h-3" />
              <span className="hidden sm:inline">Out</span>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setShowHistory(true)}>
                  <History className="w-3.5 h-3.5 text-muted-foreground" />
                  View history
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setShowEdit(true)}>
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  Edit item
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive disabled={deleting} onSelect={handleDelete}>
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </td>
      </tr>

      {moveDialog && (
        <StockMoveDialog item={item} defaultType={moveDialog} onClose={() => setMoveDialog(null)} />
      )}
      {showHistory && (
        <ItemHistoryDrawer item={item} onClose={() => setShowHistory(false)} />
      )}
      {showEdit && (
        <EditItemDialog item={item} onClose={() => setShowEdit(false)} />
      )}
    </>
  );
}

interface InventoryTableProps {
  items: InventoryItem[];
}

export function InventoryTable({ items: initialItems }: InventoryTableProps) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems);

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const lowStockItems = items.filter(isLowStock);
  const normalItems   = items.filter((i) => !isLowStock(i));
  const sorted        = [...lowStockItems, ...normalItems];
  const totalValue    = items.reduce((s, i) => s + i.current_stock * i.unit_cost, 0);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/30 p-12 text-center">
        <div className="mx-auto w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
          <Package className="w-5 h-5 text-primary" />
        </div>
        <p className="text-sm font-semibold text-foreground">No inventory items yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Click <span className="text-foreground font-medium">Add Item</span> to start tracking stock.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Category</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Unit Cost</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Value</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <ItemRow key={item.id} item={item} onDeleted={handleDeleted} />
            ))}
          </tbody>
          {/* Total row */}
          {totalValue > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-secondary/20">
                <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                  Total inventory value ({items.length} items)
                </td>
                <td className="hidden md:table-cell" />
                <td className="px-4 py-2.5 text-right hidden md:table-cell">
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    {formatCurrency(totalValue)}
                  </span>
                </td>
                <td className="hidden md:table-cell" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
