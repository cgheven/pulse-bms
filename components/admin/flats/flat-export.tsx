"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { cn, formatDate } from "@/lib/utils";
import type { ReportColumn } from "@/lib/reports/types";
import { downloadReportXlsx } from "@/lib/reports/xlsx-export";
import { downloadReportPdf } from "@/lib/reports/pdf-export";

export type InvoiceExportRow = {
  invoiceNumber: string;
  /** YYYY-MM-DD billing month. */
  month: string;
  due: string | null;
  amount: number;
  paid: number;
  balance: number;
  status: string;
};

export type PaymentExportRow = {
  date: string | null;
  receipt: string;
  mode: string;
  category: string;
  amount: number;
};

// Numeric columns stay numbers so Excel can sum them; the PDF exporter
// formats and right-aligns them. Amounts are the flat's own money.
const INVOICE_COLUMNS: ReportColumn<InvoiceExportRow>[] = [
  { id: "inv", label: "Invoice #", defaultOn: true, accessor: (r) => r.invoiceNumber, widthMm: 52 },
  { id: "month", label: "Month", defaultOn: true, accessor: (r) => formatDate(r.month), widthMm: 28 },
  { id: "due", label: "Due date", defaultOn: true, accessor: (r) => (r.due ? formatDate(r.due) : "—"), widthMm: 28 },
  { id: "amount", label: "Amount", defaultOn: true, numeric: true, accessor: (r) => r.amount, widthMm: 28 },
  { id: "paid", label: "Paid", defaultOn: true, numeric: true, accessor: (r) => r.paid, widthMm: 28 },
  { id: "balance", label: "Due (balance)", defaultOn: true, numeric: true, accessor: (r) => r.balance, widthMm: 32 },
  { id: "status", label: "Status", defaultOn: true, accessor: (r) => r.status, widthMm: 24 },
];

const PAYMENT_COLUMNS: ReportColumn<PaymentExportRow>[] = [
  { id: "date", label: "Date", defaultOn: true, accessor: (r) => (r.date ? formatDate(r.date) : "—"), widthMm: 30 },
  { id: "receipt", label: "Receipt #", defaultOn: true, accessor: (r) => r.receipt || "—", widthMm: 30 },
  { id: "mode", label: "Mode", defaultOn: true, accessor: (r) => r.mode, widthMm: 28 },
  { id: "category", label: "Category", defaultOn: true, accessor: (r) => r.category, widthMm: 30 },
  { id: "amount", label: "Amount", defaultOn: true, numeric: true, accessor: (r) => r.amount, widthMm: 30 },
];

export function FlatExport({
  flatNumber,
  buildingName,
  invoices,
  payments,
  className,
}: {
  flatNumber: string;
  buildingName: string;
  invoices: InvoiceExportRow[];
  payments: PaymentExportRow[];
  className?: string;
}) {
  const { toast } = useToast();
  const base = `flat-${flatNumber}-${new Date().toISOString().slice(0, 10)}`;
  const period = `Generated ${formatDate(new Date())}`;

  const run = async (fn: () => Promise<void>, what: string) => {
    try {
      await fn();
    } catch (err) {
      toast({
        title: `Could not export ${what}`,
        description: friendlyErrorMessage(err),
        variant: "destructive",
      });
    }
  };

  const noInvoices = invoices.length === 0;
  const noPayments = payments.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("gap-2", className)} disabled={noInvoices && noPayments}>
          <Download className="w-4 h-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          disabled={noInvoices}
          className="gap-2"
          onClick={() =>
            run(
              () =>
                downloadReportXlsx({
                  filename: `${base}-invoices`,
                  sheetName: "Invoices",
                  columns: INVOICE_COLUMNS,
                  rows: invoices,
                  totalsRow: true,
                }),
              "invoices",
            )
          }
        >
          <FileSpreadsheet className="w-4 h-4 text-[hsl(151_70%_55%)]" />
          Invoices — Excel
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={noInvoices}
          className="gap-2"
          onClick={() =>
            run(
              () =>
                downloadReportPdf({
                  meta: { title: `Flat ${flatNumber} — Invoices`, buildingName, period, filename: `${base}-invoices` },
                  columns: INVOICE_COLUMNS,
                  rows: invoices,
                  totalsRow: true,
                }),
              "invoices",
            )
          }
        >
          <FileText className="w-4 h-4 text-destructive" />
          Invoices — PDF
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={noPayments}
          className="gap-2"
          onClick={() =>
            run(
              () =>
                downloadReportXlsx({
                  filename: `${base}-payments`,
                  sheetName: "Payments",
                  columns: PAYMENT_COLUMNS,
                  rows: payments,
                  totalsRow: true,
                }),
              "payments",
            )
          }
        >
          <FileSpreadsheet className="w-4 h-4 text-[hsl(151_70%_55%)]" />
          Payments — Excel
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={noPayments}
          className="gap-2"
          onClick={() =>
            run(
              () =>
                downloadReportPdf({
                  meta: { title: `Flat ${flatNumber} — Payments`, buildingName, period, filename: `${base}-payments` },
                  columns: PAYMENT_COLUMNS,
                  rows: payments,
                  totalsRow: true,
                }),
              "payments",
            )
          }
        >
          <FileText className="w-4 h-4 text-destructive" />
          Payments — PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
