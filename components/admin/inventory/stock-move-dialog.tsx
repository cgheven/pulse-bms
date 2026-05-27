"use client";

import { useState, useTransition } from "react";
import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { recordStockMovement, type InventoryItem } from "@/app/actions/inventory";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";

type MoveType = "in" | "out" | "adjustment";

interface StockMoveDialogProps {
  item: InventoryItem;
  defaultType?: MoveType;
  onClose: () => void;
}

const TYPE_CONFIG: Record<MoveType, { label: string; icon: React.ReactNode; color: string }> = {
  in:         { label: "Restock",     icon: <ArrowDownToLine className="w-3.5 h-3.5" />, color: "text-success" },
  out:        { label: "Use / Issue", icon: <ArrowUpFromLine className="w-3.5 h-3.5" />,  color: "text-destructive" },
  adjustment: { label: "Adjust",      icon: <SlidersHorizontal className="w-3.5 h-3.5" />, color: "text-primary" },
};

const REASONS: Record<MoveType, string[]> = {
  in:         ["Purchase", "Return", "Transfer in", "Other"],
  out:        ["Used in maintenance", "Distributed to staff", "Damaged / disposed", "Other"],
  adjustment: ["Stock count correction", "Data entry fix", "Other"],
};

export function StockMoveDialog({ item, defaultType = "in", onClose }: StockMoveDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<MoveType>(defaultType);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState(String(item.unit_cost || ""));
  const [reason, setReason] = useState(REASONS[defaultType][0]);
  const [notes, setNotes] = useState("");

  const qty = parseFloat(quantity) || 0;
  const cost = parseFloat(unitCost) || 0;

  const previewStock =
    type === "adjustment" ? qty
    : type === "in"       ? item.current_stock + qty
    :                       item.current_stock - qty;

  const batchCost = type === "in" ? qty * cost : null;

  function handleTypeChange(t: MoveType) {
    setType(t);
    setReason(REASONS[t][0]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (quantity === "" || qty < 0 || (type !== "adjustment" && qty <= 0)) return;
    startTransition(async () => {
      try {
        await recordStockMovement({
          item_id: item.id,
          type,
          quantity: qty,
          unit_cost: type === "in" ? cost : undefined,
          reason: reason || undefined,
          notes: notes || undefined,
        });
        toast({
          title: "Stock updated",
          description: `${item.name}: ${type === "adjustment" ? "set to" : type === "in" ? "+" : "-"}${qty} ${item.unit}`,
        });
        onClose();
      } catch (err) {
        toast({
          title: "Failed",
          description: friendlyErrorMessage(err as Error),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className="fixed inset-0 z-50 overflow-y-auto focus:outline-none">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
              {/* Header */}
              <div className="px-5 py-4 border-b border-border">
                <p className="text-xs text-muted-foreground mb-0.5">Update stock for</p>
                <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                  {item.name}
                </DialogPrimitive.Title>
                <p className="text-xs text-muted-foreground mt-1">
                  Current: <span className="font-semibold text-foreground">{item.current_stock} {item.unit}</span>
                  {item.unit_cost > 0 && (
                    <span className="ml-2">· Rs. {item.unit_cost.toLocaleString("en-PK")}/{item.unit}</span>
                  )}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {/* Type toggle */}
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-secondary border border-border">
                  {(Object.entries(TYPE_CONFIG) as [MoveType, typeof TYPE_CONFIG[MoveType]][]).map(([t, c]) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleTypeChange(t)}
                      className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        type === t
                          ? "bg-card shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className={type === t ? c.color : ""}>{c.icon}</span>
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Quantity */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    {type === "adjustment" ? "Set stock to" : "Quantity"} ({item.unit})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder={type === "adjustment" ? String(item.current_stock) : "0"}
                    required
                    autoFocus
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                  {(quantity !== "" && (type === "adjustment" ? qty >= 0 : qty > 0)) && (
                    <p className="text-xs text-muted-foreground">
                      After:{" "}
                      <span className={`font-semibold ${previewStock < 0 ? "text-destructive" : previewStock <= item.min_stock ? "text-amber-600" : "text-success"}`}>
                        {previewStock} {item.unit}
                      </span>
                      {type === "out" && previewStock < 0 && (
                        <span className="text-destructive ml-1.5">— not enough stock</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Unit cost — shown for Restock only */}
                {type === "in" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">
                      Unit Cost (Rs.)
                      <span className="text-muted-foreground font-normal ml-1">— updates item price</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">Rs.</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={unitCost}
                        onChange={(e) => setUnitCost(e.target.value)}
                        placeholder="0"
                        className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                      />
                    </div>
                    {batchCost !== null && batchCost > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Batch cost: <span className="font-semibold text-foreground">Rs. {batchCost.toLocaleString("en-PK")}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Reason */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Reason</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  >
                    {REASONS[type].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Notes <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any details…"
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 h-9 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || quantity === "" || qty < 0 || (type !== "adjustment" && qty <= 0) || (type === "out" && previewStock < 0)}
                    className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPending ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
