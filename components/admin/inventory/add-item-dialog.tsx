"use client";

import { useState, useTransition } from "react";
import { Plus, Package } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { createInventoryItem, type InventoryCategory, type InventoryUnit } from "@/app/actions/inventory";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";

const CATEGORIES: { value: InventoryCategory; label: string }[] = [
  { value: "cleaning",    label: "Cleaning" },
  { value: "electrical",  label: "Electrical" },
  { value: "plumbing",    label: "Plumbing" },
  { value: "safety",      label: "Safety" },
  { value: "tools",       label: "Tools" },
  { value: "maintenance", label: "Maintenance" },
  { value: "general",     label: "General" },
];

const UNITS: { value: InventoryUnit; label: string }[] = [
  { value: "pieces", label: "Pieces" },
  { value: "litres", label: "Litres" },
  { value: "kg",     label: "KG" },
  { value: "meters", label: "Meters" },
  { value: "boxes",  label: "Boxes" },
  { value: "rolls",  label: "Rolls" },
  { value: "pairs",  label: "Pairs" },
  { value: "sets",   label: "Sets" },
];

export function AddItemDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>("general");
  const [unit, setUnit] = useState<InventoryUnit>("pieces");
  const [currentStock, setCurrentStock] = useState("");
  const [minStock, setMinStock] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setName(""); setCategory("general"); setUnit("pieces");
    setCurrentStock(""); setMinStock(""); setUnitCost("");
    setLocation(""); setNotes("");
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    setOpen(v);
  }

  const qty = parseFloat(currentStock) || 0;
  const cost = parseFloat(unitCost) || 0;
  const totalValue = qty * cost;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createInventoryItem({
          name,
          category,
          unit,
          current_stock: qty,
          min_stock: parseFloat(minStock) || 0,
          unit_cost: cost,
          location: location || undefined,
          notes: notes || undefined,
        });
        toast({ title: "Item added", description: `${name} added to inventory.` });
        reset();
        setOpen(false);
      } catch (err) {
        toast({
          title: "Failed to add item",
          description: friendlyErrorMessage(err as Error),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </DialogPrimitive.Trigger>

      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className="fixed inset-0 z-50 overflow-y-auto focus:outline-none">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20">
                  <Package className="w-4 h-4 text-primary" />
                </div>
                <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                  Add Inventory Item
                </DialogPrimitive.Title>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Item Name *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Broom, Extension cord, Pipe wrench…"
                    required
                    autoFocus
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>

                {/* Category + Unit */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as InventoryCategory)}
                      className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Unit</label>
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value as InventoryUnit)}
                      className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                    >
                      {UNITS.map((u) => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Unit Cost */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Unit Cost (Rs.) *
                    <span className="text-muted-foreground font-normal ml-1">— cost per {unit}</span>
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
                      required
                      className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                    />
                  </div>
                </div>

                {/* Stock levels */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Current Stock</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={currentStock}
                      onChange={(e) => setCurrentStock(e.target.value)}
                      placeholder="0"
                      className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">
                      Min Stock <span className="text-muted-foreground font-normal">(alert)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={minStock}
                      onChange={(e) => setMinStock(e.target.value)}
                      placeholder="0"
                      className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                    />
                  </div>
                </div>

                {/* Live value preview */}
                {qty > 0 && cost > 0 && (
                  <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total stock value</span>
                    <span className="text-xs font-semibold text-primary">
                      Rs. {totalValue.toLocaleString("en-PK")}
                    </span>
                  </div>
                )}

                {/* Location */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Storage Location <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Store room, Guard post, Basement…"
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Notes <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Any additional details…"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 resize-none"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      className="flex-1 h-9 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      Cancel
                    </button>
                  </DialogPrimitive.Close>
                  <button
                    type="submit"
                    disabled={isPending || !name.trim()}
                    className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPending ? "Adding…" : "Add Item"}
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
