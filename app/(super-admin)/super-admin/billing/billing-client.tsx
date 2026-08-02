"use client";

import { useMemo, useState } from "react";
import { Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate, formatLakh } from "@/lib/utils";
import { computeInvoiceAmounts, resolveTier, standardMonthlyRate } from "@/lib/client-pricing";
import { BuildingBillingDialog } from "./building-billing-dialog";
import {
  invoiceStatusPill,
  isOverdue,
  latestInvoice,
  outstandingTotal,
  pricingFlats,
  type BillingBuildingRow,
} from "./billing-shared";

type Filter = "all" | "configured" | "unconfigured" | "unpaid" | "overdue";

const FILTER_LABELS: Record<Filter, string> = {
  all: "All buildings",
  configured: "Billing set up",
  unconfigured: "Not set up",
  unpaid: "Has unpaid invoices",
  overdue: "Overdue",
};

/**
 * Monthly-equivalent charged amount for a building, folding in the override
 * and (for annual clients) the annual discount. All maths comes from
 * lib/client-pricing.ts — never duplicated here.
 */
function monthlyEquivalent(row: BillingBuildingRow): number {
  const { flats } = pricingFlats(row);
  const amounts = computeInvoiceAmounts({
    flats,
    monthlyRateOverride: row.billing?.monthly_rate ?? null,
    billingCycle: row.billing?.billing_cycle ?? "monthly",
    discountPct: row.billing?.annual_discount_pct ?? null,
    waiveOnboarding: true,
    isFirstInvoice: false,
  });
  return amounts.subscriptionAmount / amounts.periodMultiplier;
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "amber" | "red";
}) {
  return (
    <div className="card-soft p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </p>
      <p
        className={[
          "text-2xl font-bold tabular-nums mt-1",
          accent === "amber" ? "text-primary" : "",
          accent === "red" ? "text-destructive" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export function BillingClient({ rows }: { rows: BillingBuildingRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const stats = useMemo(() => {
    let configured = 0;
    let mrr = 0;
    let outstanding = 0;
    let overdueCount = 0;
    for (const row of rows) {
      if (row.billing) {
        configured += 1;
        if (row.is_active) mrr += monthlyEquivalent(row);
      }
      outstanding += outstandingTotal(row.invoices);
      overdueCount += row.invoices.filter((i) => isOverdue(i)).length;
    }
    return { configured, mrr, outstanding, overdueCount };
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !`${row.name} ${row.city ?? ""}`.toLowerCase().includes(q)) return false;
      switch (filter) {
        case "configured":
          return row.billing !== null;
        case "unconfigured":
          return row.billing === null;
        case "unpaid":
          return row.invoices.some((i) => i.status === "unpaid");
        case "overdue":
          return row.invoices.some((i) => isOverdue(i));
        default:
          return true;
      }
    });
  }, [rows, query, filter]);

  const openRow = openId ? (rows.find((r) => r.id === openId) ?? null) : null;

  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Billing set up"
          value={`${stats.configured}`}
          sub={`of ${rows.length} buildings`}
        />
        <Kpi
          label="Monthly recurring"
          value={formatLakh(Math.round(stats.mrr))}
          sub="Active clients, monthly equivalent"
          accent="amber"
        />
        <Kpi
          label="Outstanding"
          value={formatLakh(stats.outstanding)}
          sub="Unpaid invoices"
        />
        <Kpi
          label="Overdue"
          value={`${stats.overdueCount}`}
          sub="Past their due date"
          accent={stats.overdueCount > 0 ? "red" : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search building or city…"
            className="h-9 text-sm pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="h-9 text-sm w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => (
              <SelectItem key={key} value={key}>
                {FILTER_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="card-soft p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">
                  Building
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">
                  Tier / Flats
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-right">
                  Standard
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-right">
                  Charged
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">
                  Cycle
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">
                  Next invoice
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">
                  Last invoice
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-sm">
                    No buildings match this filter.
                  </td>
                </tr>
              )}
              {visible.map((row) => {
                const { flats, basis } = pricingFlats(row);
                const tier = resolveTier(flats);
                const standard = standardMonthlyRate(flats);
                const charged = row.billing ? monthlyEquivalent(row) : null;
                const discounted = charged !== null && charged < standard;
                const last = latestInvoice(row);
                const lastOverdue = last ? isOverdue(last) : false;

                return (
                  <tr key={row.id} className="border-t border-border hover:bg-secondary/40">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-sm">{row.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.city ?? "—"}
                        {row.is_trial && (
                          <span className="ml-1.5 status-info px-1.5 py-px rounded-full text-[10px]">
                            Trial
                          </span>
                        )}
                        {!row.is_active && (
                          <span className="ml-1.5 status-overdue px-1.5 py-px rounded-full text-[10px]">
                            Inactive
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {tier.name}
                      <span className="block text-xs text-muted-foreground">
                        {flats} flats {basis === "limit" ? "(limit)" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                      {formatCurrency(standard)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums">
                      {charged === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          <span className={discounted ? "font-semibold text-primary" : "font-semibold"}>
                            {formatCurrency(Math.round(charged))}
                          </span>
                          {discounted && standard > 0 && (
                            <span className="block text-[10px] text-primary">
                              {Math.round(((standard - charged) / standard) * 100)}% off
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sm capitalize">
                      {row.billing?.billing_cycle ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {row.billing?.next_invoice_date
                        ? formatDate(row.billing.next_invoice_date)
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {last ? (
                        <>
                          <span
                            className={`inline-flex px-2 py-0.5 text-[10px] rounded-full ${invoiceStatusPill(last.status, lastOverdue)}`}
                          >
                            {last.status === "paid"
                              ? "Paid"
                              : last.status === "cancelled"
                                ? "Cancelled"
                                : lastOverdue
                                  ? "Overdue"
                                  : "Pending"}
                          </span>
                          <span className="block text-xs text-muted-foreground mt-0.5">
                            {last.period_label} · {formatCurrency(Number(last.amount))}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => setOpenId(row.id)}
                      >
                        <Wallet />
                        {row.billing ? "Billing" : "Set up"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {openRow && (
        <BuildingBillingDialog
          key={openRow.id}
          row={openRow}
          open
          onOpenChange={(o) => !o && setOpenId(null)}
        />
      )}
    </>
  );
}
