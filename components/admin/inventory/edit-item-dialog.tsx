"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { updateInventoryItem, type InventoryItem, type InventoryCategory, type InventoryUnit } from "@/app/actions/inventory";
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

interface Props {
  item: InventoryItem;
  onClose: () => void;
}

export function EditItemDialog({ item, onClose }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<InventoryCategory>(item.category as InventoryCategory);
  const [unit, setUnit] = useState<InventoryUnit>(item.unit as InventoryUnit);
  const [minStock, setMinStock] = useState(String(item.min_stock));
  const [unitCost, setUnitCost] = useState(String(item.unit_cost));
  const [location, setLocation] = useState(item.location ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateInventoryItem(item.id, {
          name,
          category,
          unit,
          min_stock: parseFloat(minStock) || 0,
          unit_cost: parseFloat(unitCost) || 0,
          location: location || undefined,
          notes: notes || undefined,
        });
        toast({ title: "Item updated" });
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
            <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20">
                  <Pencil className="w-4 h-4 text-primary" />
                </div>
                <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                  Edit Item
                </DialogPrimitive.Title>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Item Name *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>

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
                  <label className="text-xs font-medium text-foreground">Unit Cost (Rs.)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">Rs.</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                      className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Current stock value: Rs. {(item.current_stock * (parseFloat(unitCost) || 0)).toLocaleString("en-PK")}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Min Stock <span className="text-muted-foreground font-normal">(alert threshold)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Storage Location <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Store room, Guard post…"
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Notes <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 resize-none"
                  />
                </div>

                <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
                  To change stock quantity, use the In / Out buttons on the item row.
                </p>

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
                    disabled={isPending || !name.trim()}
                    className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPending ? "Saving…" : "Save Changes"}
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
