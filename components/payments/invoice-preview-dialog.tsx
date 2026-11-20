"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { InvoiceCard, type InvoiceCardProps } from "@/components/payments/invoice-card";
import { getInvoiceDocument } from "@/app/actions/billing";

/**
 * In-place invoice preview — a dark, padded modal with the bill shown as a
 * centred white document card (same shape as the printed page), matching the
 * HMS preview. The document loads lazily when first opened; "Open in new tab"
 * links to the full-page printable version.
 */
export function InvoicePreviewDialog({
  invoiceId,
  subtitle,
  open,
  onOpenChange,
}: {
  invoiceId: string;
  /** Shown under the title, e.g. "Musab Khan · 2026-11". */
  subtitle?: string;
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
        className="max-w-2xl max-h-[90vh] p-0 gap-0 flex flex-col"
      >
        <DialogHeader className="no-print shrink-0 space-y-0.5 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-lg">Invoice preview</DialogTitle>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </DialogHeader>

        {/* Dark body; the document sits as a centred white card. */}
        <div className="flex-1 overflow-y-auto bg-secondary/40 p-5">
          {loading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
          {error && !loading && (
            <p className="py-16 text-center text-sm text-destructive">{error}</p>
          )}
          {data && !loading && (
            <div
              id="print-area"
              className="mx-auto w-full max-w-[460px] overflow-hidden rounded-md bg-white shadow-xl"
            >
              <InvoiceCard {...data} />
            </div>
          )}
        </div>

        <DialogFooter className="no-print shrink-0 gap-2 border-t border-border px-5 py-3 sm:justify-end">
          <Button variant="outline" asChild>
            <a
              href={`/admin/invoices/${invoiceId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-4 h-4" />
              Open in new tab
            </a>
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
