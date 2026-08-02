"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Receipt, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatCurrency, formatDate, formatMonthLabel } from "@/lib/utils";
import { toIntlNoPlus } from "@/lib/phone";
import {
  RecordPaymentDialog,
  type FlatPickerOption,
} from "@/components/admin/payments/record-payment-dialog";

export type DefaulterRow = {
  invoice_id: string;
  invoice_number: string;
  flat_id: string;
  flat_number: string;
  resident_id: string | null;
  resident_name: string | null;
  resident_phone: string | null;
  billing_month: string;
  due_date: string | null;
  amount_total: number;
  amount_paid: number;
  amount_due: number;
  days_late: number;
};

type Filter = "not_paid" | "overdue" | "all";

export function DuesDefaultersPanel({
  defaulters,
  buildingName,
  buildingId,
  flatPickerOptions = [],
}: {
  defaulters: DefaulterRow[];
  buildingName: string;
  buildingId?: string;
  flatPickerOptions?: FlatPickerOption[];
}) {
  const [filter, setFilter] = useState<Filter>("not_paid");
  const [month, setMonth] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [recordRow, setRecordRow] = useState<DefaulterRow | null>(null);

  // Months that actually carry dues, newest first — no empty options.
  const months = useMemo(() => {
    const s = new Set<string>();
    for (const d of defaulters) s.add(d.billing_month.slice(0, 7));
    return Array.from(s).sort().reverse();
  }, [defaulters]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return defaulters.filter((d) => {
      if (filter === "overdue" && d.days_late <= 0) return false;
      if (filter === "not_paid" && d.amount_due <= 0) return false;
      if (month !== "all" && d.billing_month.slice(0, 7) !== month) return false;
      if (!q) return true;
      return (
        d.flat_number.toLowerCase().includes(q) ||
        (d.resident_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [defaulters, filter, month, query]);

  const totalDue = filtered.reduce((s, d) => s + d.amount_due, 0);

  if (defaulters.length === 0) {
    return (
      <div className="card-soft">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-[hsl(151_70%_28%/0.1)] flex items-center justify-center shrink-0">
            <Receipt className="h-5 w-5 text-[hsl(151_70%_28%)]" />
          </div>
          <div>
            <h3 className="font-semibold">All clear — no dues this month</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Every flat with an invoice has paid in full.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-soft space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h3 className="font-semibold">
              {month === "all"
                ? "Maintenance dues — not paid"
                : `Maintenance dues — ${formatMonthLabel(month)}`}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filtered.length} {filtered.length === 1 ? "invoice" : "invoices"}{" "}
              • {formatCurrency(totalDue)} still due
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="inline-flex gap-1 rounded-md bg-muted p-1 shrink-0">
          <FilterChip
            active={filter === "not_paid"}
            onClick={() => setFilter("not_paid")}
          >
            Not paid
          </FilterChip>
          <FilterChip
            active={filter === "overdue"}
            onClick={() => setFilter("overdue")}
          >
            Overdue only
          </FilterChip>
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
          </FilterChip>
        </div>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="shrink-0 sm:w-48">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {formatMonthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search by flat or resident"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No flats match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="px-4 sm:px-2 py-2 font-medium">Flat</th>
                <th className="px-4 sm:px-2 py-2 font-medium hidden md:table-cell">
                  Month
                </th>
                <th className="px-4 sm:px-2 py-2 font-medium text-right">
                  Still due
                </th>
                <th className="px-4 sm:px-2 py-2 font-medium hidden sm:table-cell">
                  Status
                </th>
                <th className="px-4 sm:px-2 py-2 font-medium text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <DefaulterRowCard
                  key={d.invoice_id}
                  row={d}
                  buildingName={buildingName}
                  onRecord={buildingId ? () => setRecordRow(d) : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recordRow && buildingId && (
        <RecordPaymentDialog
          open={!!recordRow}
          onOpenChange={(b) => !b && setRecordRow(null)}
          flats={flatPickerOptions}
          buildingName={buildingName}
          buildingId={buildingId}
          presetInvoice={{
            invoice_id: recordRow.invoice_id,
            flat_id: recordRow.flat_id,
            flat_number: recordRow.flat_number,
            invoice_number: recordRow.invoice_number,
            billing_month: recordRow.billing_month,
            amount_due: recordRow.amount_due,
            resident_id: recordRow.resident_id,
            resident_name: recordRow.resident_name,
          }}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-sm font-medium transition ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function DefaulterRowCard({
  row,
  buildingName,
  onRecord,
}: {
  row: DefaulterRow;
  buildingName: string;
  onRecord?: () => void;
}) {
  const intl = toIntlNoPlus(row.resident_phone);
  const monthLabel = new Date(row.billing_month).toLocaleDateString("en-PK", {
    month: "long",
    year: "numeric",
  });

  // Roman-Urdu gap-aware reminder. Personalised per resident, includes the
  // already-paid amount so it can't be misread as "you owe the full month".
  const paidNote =
    row.amount_paid > 0
      ? `Rs. ${row.amount_paid.toLocaleString("en-PK")} mil chuke hain, total Rs. ${row.amount_total.toLocaleString("en-PK")}.`
      : `Total Rs. ${row.amount_total.toLocaleString("en-PK")}.`;
  const greeting = row.resident_name ? `Asalam-o-Alaikum ${row.resident_name},` : "Asalam-o-Alaikum,";
  const waText = [
    greeting,
    "",
    `Aap ki ${monthLabel} maintenance ke Rs. ${row.amount_due.toLocaleString("en-PK")} abhi tak baqi hain.`,
    paidNote,
    "",
    "Shukriya.",
    `— ${buildingName} Admin`,
  ].join("\n");

  const waHref = intl
    ? `https://wa.me/${intl}?text=${encodeURIComponent(waText)}`
    : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 sm:px-2 py-3 align-top">
        <div className="font-semibold">{row.flat_number}</div>
        <div className="text-xs text-muted-foreground">
          {row.resident_name ?? "No resident"}
        </div>
        <div className="md:hidden text-xs text-muted-foreground mt-0.5">
          {monthLabel}
        </div>
      </td>
      <td className="px-4 sm:px-2 py-3 align-top hidden md:table-cell">
        <div>{monthLabel}</div>
        {row.due_date && (
          <div className="text-xs text-muted-foreground">
            Due {formatDate(row.due_date)}
          </div>
        )}
      </td>
      <td className="px-4 sm:px-2 py-3 align-top text-right">
        <div className="font-bold text-destructive">
          {formatCurrency(row.amount_due)}
        </div>
        {row.amount_paid > 0 && (
          <div className="text-xs text-muted-foreground">
            Paid {formatCurrency(row.amount_paid)} of {formatCurrency(row.amount_total)}
          </div>
        )}
      </td>
      <td className="px-4 sm:px-2 py-3 align-top hidden sm:table-cell">
        {row.days_late > 0 ? (
          <span className="text-xs font-medium text-destructive">
            {row.days_late} {row.days_late === 1 ? "day" : "days"} late
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Within due date</span>
        )}
      </td>
      <td className="px-4 sm:px-2 py-3 align-top">
        <div className="flex flex-col sm:flex-row gap-1.5 justify-end">
          {intl ? (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[hsl(151_70%_28%)] hover:bg-[hsl(151_70%_24%)] transition"
              title={`Send reminder to ${row.resident_name ?? "resident"}`}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          ) : (
            <span
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground bg-muted"
              title="No phone number on file"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              No phone
            </span>
          )}
          {onRecord && (
            <Button variant="outline" size="sm" onClick={onRecord}>
              <Receipt className="h-3.5 w-3.5" />
              Record
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
