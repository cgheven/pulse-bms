"use client";

import { useState, useEffect } from "react";
import { X, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, Loader2 } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { getInventoryTransactions, type InventoryItem } from "@/app/actions/inventory";
import { formatDate } from "@/lib/utils";

type TxRow = {
  id: string;
  type: "in" | "out" | "adjustment";
  quantity: number;
  reason: string | null;
  notes: string | null;
  created_at: string;
  bms_profiles: { full_name: string } | { full_name: string }[] | null;
};

function actorName(row: TxRow): string {
  const p = row.bms_profiles;
  if (!p) return "—";
  const obj = Array.isArray(p) ? p[0] : p;
  return obj?.full_name ?? "—";
}

const TX_ICON: Record<string, React.ReactNode> = {
  in:         <ArrowDownToLine className="w-3 h-3 text-success" />,
  out:        <ArrowUpFromLine className="w-3 h-3 text-destructive" />,
  adjustment: <SlidersHorizontal className="w-3 h-3 text-primary" />,
};
const TX_COLOR: Record<string, string> = {
  in:         "text-success",
  out:        "text-destructive",
  adjustment: "text-primary",
};

interface Props {
  item: InventoryItem;
  onClose: () => void;
}

export function ItemHistoryDrawer({ item, onClose }: Props) {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInventoryTransactions(item.id)
      .then(({ data }) => setRows(data as TxRow[]))
      .finally(() => setLoading(false));
  }, [item.id]);

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className="fixed inset-0 z-50 overflow-y-auto focus:outline-none">
          <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-border bg-card shadow-xl max-h-[85vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                <div>
                  <p className="text-xs text-muted-foreground">Stock history</p>
                  <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                    {item.name}
                  </DialogPrimitive.Title>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              <div className="overflow-y-auto flex-1 p-4">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  </div>
                ) : rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No transactions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {rows.map((row) => (
                      <div key={row.id} className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 p-3">
                        <div className="w-6 h-6 rounded-md bg-card border border-border flex items-center justify-center shrink-0 mt-0.5">
                          {TX_ICON[row.type]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-semibold capitalize ${TX_COLOR[row.type]}`}>
                              {row.type === "in" ? "+" : row.type === "out" ? "-" : ""}
                              {row.quantity} {item.unit}
                            </span>
                            {row.reason && (
                              <span className="text-xs text-muted-foreground">{row.reason}</span>
                            )}
                          </div>
                          {row.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic">{row.notes}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground/70 mt-1">
                            {actorName(row)} · {formatDate(row.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
