"use client";

import { useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export type StatementInput = {
  building_name: string;
  monthly: { month: string; income: number; expense: number; net: number }[];
  income_ytd: number;
  expense_ytd: number;
  net_ytd: number;
  fund_balance: number;
};

export function MonthlyStatementButton({ data }: { data: StatementInput }) {
  const [busy, setBusy] = useState(false);
  const onClick = () => {
    setBusy(true);
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      doc.setFontSize(18);
      doc.text("Building Financial Statement", 14, 18);
      doc.setFontSize(11);
      doc.text(data.building_name, 14, 26);
      doc.text(`Generated: ${formatDate(new Date())}`, 14, 32);

      autoTable(doc, {
        startY: 40,
        head: [["Metric", "Amount"]],
        body: [
          ["Income (YTD)", formatCurrency(data.income_ytd)],
          ["Expenses (YTD)", formatCurrency(data.expense_ytd)],
          ["Net P&L (YTD)", formatCurrency(data.net_ytd)],
          ["Fund balance", formatCurrency(data.fund_balance)],
        ],
        styles: { fontSize: 11 },
        headStyles: { fillColor: [30, 58, 138] },
      });

      // @ts-expect-error jspdf-autotable adds lastAutoTable
      let nextY = doc.lastAutoTable?.finalY ?? 80;
      nextY += 8;
      doc.setFontSize(13);
      doc.text("Last 12 months", 14, nextY);

      autoTable(doc, {
        startY: nextY + 4,
        head: [["Month", "Income", "Expense", "Net"]],
        body: data.monthly.map((m) => [
          m.month,
          formatCurrency(m.income),
          formatCurrency(m.expense),
          formatCurrency(m.net),
        ]),
        styles: { fontSize: 10 },
        headStyles: { fillColor: [30, 58, 138] },
      });

      doc.save(`statement-${formatDate(new Date()).replace(/\s+/g, "-")}.pdf`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button onClick={onClick} disabled={busy} variant="outline">
      <Download className="w-4 h-4" />
      {busy ? "Generating..." : "Download statement PDF"}
    </Button>
  );
}
