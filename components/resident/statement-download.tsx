"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";

type Row = {
  date: string;
  kind: "Income" | "Expense";
  category: string;
  description: string;
  party: string;
  amount: number;
};

function ymRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function StatementDownload({
  buildingId,
  buildingName,
  buildingAddress,
  buildingCity,
}: {
  buildingId: string;
  buildingName: string;
  buildingAddress?: string | null;
  buildingCity?: string | null;
}) {
  const now = new Date();
  const initial = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // last 12 months options
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    options.push({
      value: v,
      label: d.toLocaleString("en-PK", { month: "long", year: "numeric" }),
    });
  }
  const [month, setMonth] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function download() {
    startTransition(async () => {
      try {
        const { start, end } = ymRange(month);
        const supabase = createClient();

        const [{ data: payments }, { data: expenses }] = await Promise.all([
          supabase
            .from("bms_payments")
            .select("amount, payment_date, payment_mode, reference_no, category, receipt_no, bms_flats(flat_number)")
            .eq("building_id", buildingId)
            .gte("payment_date", start)
            .lte("payment_date", end)
            .order("payment_date", { ascending: true }),
          supabase
            .from("bms_expenses")
            .select("amount, expense_date, category, subcategory, description, vendor")
            .eq("building_id", buildingId)
            .gte("expense_date", start)
            .lte("expense_date", end)
            .order("expense_date", { ascending: true }),
        ]);

        type Pay = { amount: number; payment_date: string | null; payment_mode: string | null; reference_no: string | null; category: string | null; receipt_no: string | null; bms_flats: { flat_number: string } | { flat_number: string }[] | null };
        type Exp = { amount: number; expense_date: string | null; category: string; subcategory: string | null; description: string; vendor: string | null };

        const rows: Row[] = [];
        for (const p of (payments ?? []) as Pay[]) {
          const flat = Array.isArray(p.bms_flats) ? p.bms_flats[0] : p.bms_flats;
          rows.push({
            date: p.payment_date ?? "",
            kind: "Income",
            category: p.category ?? "Maintenance",
            description: `Flat ${flat?.flat_number ?? "-"}${p.reference_no ? ` · Ref ${p.reference_no}` : ""}`,
            party: p.payment_mode ?? "—",
            amount: Number(p.amount),
          });
        }
        for (const e of (expenses ?? []) as Exp[]) {
          rows.push({
            date: e.expense_date ?? "",
            kind: "Expense",
            category: e.category,
            description: e.description + (e.subcategory ? ` (${e.subcategory})` : ""),
            party: e.vendor ?? "—",
            amount: Number(e.amount),
          });
        }
        rows.sort((a, b) => a.date.localeCompare(b.date));

        const totalIncome = rows.filter((r) => r.kind === "Income").reduce((s, r) => s + r.amount, 0);
        const totalExpense = rows.filter((r) => r.kind === "Expense").reduce((s, r) => s + r.amount, 0);
        const net = totalIncome - totalExpense;

        const { jsPDF } = await import("jspdf");
        const autoTableMod = await import("jspdf-autotable");
        const autoTable = autoTableMod.default;

        const doc = new jsPDF({ unit: "pt", format: "a4" });
        const w = doc.internal.pageSize.getWidth();

        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text(buildingName, w / 2, 50, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const addr = [buildingAddress, buildingCity].filter(Boolean).join(", ");
        if (addr) doc.text(addr, w / 2, 68, { align: "center" });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        const monthLabel = options.find((o) => o.value === month)?.label ?? month;
        doc.text(`Monthly Financial Statement — ${monthLabel}`, w / 2, 96, { align: "center" });

        autoTable(doc, {
          startY: 116,
          head: [["Date", "Type", "Category", "Description", "Party", "Amount (Rs.)"]],
          body: rows.length === 0
            ? [["—", "—", "—", "No transactions this month", "—", "—"]]
            : rows.map((r) => [
                r.date ? formatDate(r.date) : "—",
                r.kind,
                r.category,
                r.description,
                r.party,
                new Intl.NumberFormat("en-PK").format(r.amount),
              ]),
          theme: "grid",
          styles: { fontSize: 9, cellPadding: 5 },
          headStyles: { fillColor: [30, 64, 175], textColor: 255 },
          columnStyles: {
            1: { cellWidth: 50 },
            5: { halign: "right" },
          },
        });

        const endY =
          (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
        let y = endY + 24;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(`Total Income:  ${formatCurrency(totalIncome)}`, w - 40, y, { align: "right" });
        y += 18;
        doc.text(`Total Expense: ${formatCurrency(totalExpense)}`, w - 40, y, { align: "right" });
        y += 18;
        doc.setFontSize(13);
        doc.setTextColor(net >= 0 ? 21 : 190, net >= 0 ? 128 : 18, net >= 0 ? 61 : 60);
        doc.text(`Net:           ${formatCurrency(net)}`, w - 40, y, { align: "right" });
        doc.setTextColor(0, 0, 0);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(
          "Generated for transparency. Pulse BMS — Resident Portal.",
          w / 2,
          doc.internal.pageSize.getHeight() - 30,
          { align: "center" }
        );

        doc.save(`Statement-${buildingName.replace(/\s+/g, "_")}-${month}.pdf`);
      } catch (e) {
        console.error(e);
        alert("Could not build statement PDF");
      }
    });
  }

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div>
        <label className="block text-sm text-muted-foreground mb-1">Pick a month</label>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="h-12 w-56 text-base">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-base">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button className="btn-big" onClick={download} disabled={isPending}>
        <Download className="w-5 h-5" />
        {isPending ? "Preparing..." : "Download Statement"}
      </Button>
    </div>
  );
}
