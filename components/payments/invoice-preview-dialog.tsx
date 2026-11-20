"use client";

import { useEffect, useState } from "react";
import { Printer, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { InvoiceCard, type InvoiceCardProps } from "@/components/payments/invoice-card";
import { getInvoiceDocument } from "@/app/actions/billing";

/**
 * In-place invoice preview — opens the maintenance bill in a modal (not a new
 * page), loading the document lazily when first opened. Print button prints
 * just the invoice via the `#print-area` print system.
 */
export function InvoicePreviewDialog({
  invoiceId,
  open,
  onOpenChange,
}: {
  invoiceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<InvoiceCardProps | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getInvoiceDocument(invoiceId)
      .then((d) => {
        if (cancelled) return;
        if (d) setData(d);
        else setError("Invoice not found.");
      })
      .catch((e) => !cancelled && setError(friendlyErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, invoiceId, data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0"
      >
        <DialogHeader className="no-print flex-row items-center justify-between gap-2 border-b border-border px-4 py-3 space-y-0">
          <DialogTitle className="text-base">Invoice preview</DialogTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 mr-8"
            disabled={!data}
            onClick={() => window.print()}
          >
            <Printer className="w-4 h-4" />
            Print
          </Button>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
        {error && !loading && (
          <p className="py-16 text-center text-sm text-destructive">{error}</p>
        )}
        {data && !loading && (
          <div id="print-area" className="bg-white">
            <InvoiceCard {...data} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
