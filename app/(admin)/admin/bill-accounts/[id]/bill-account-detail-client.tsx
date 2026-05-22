"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatCurrency, formatDate, formatLakh } from "@/lib/utils";
import {
  providerLabelFor,
  UNITS_LABEL,
} from "@/lib/bill-providers";

type AccountRow = {
  id: string;
  provider: string;
  provider_label: string | null;
  nickname: string;
  account_number: string;
  location: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

type BillRow = {
  id: string;
  expense_date: string;
  amount: number;
  units_consumed: number | null;
  vendor: string;
  description: string;
  subcategory: string;
  bank_account_id: string | null;
  due_date: string | null;
  recurrence: "monthly" | "quarterly" | "yearly" | null;
};

function daysBetween(a: string, b: string): number {
  const ms = new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}

type BankAccount = { id: string; name: string; type: "cash" | "bank" };

const NUM_FMT = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

function formatUnits(n: number): string {
  return NUM_FMT.format(n);
}

function monthKey(iso: string): string {
  // YYYY-MM-DD → YYYY-MM. Keys sort lexicographically the same as
  // chronologically, which we use later to build a 24-month rolling
  // window.
  return iso.slice(0, 7);
}

function monthLabel(key: string): string {
  // "2026-04" → "Apr 2026". Locale-agnostic for the consistent
  // accountant-grade look the printed report has.
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1, 1);
  return d.toLocaleDateString("en-PK", { month: "short", year: "numeric" });
}

export function BillAccountDetailClient({
  account,
  bills,
  bankAccounts,
}: {
  account: AccountRow;
  bills: BillRow[];
  bankAccounts: BankAccount[];
}) {
  const providerLabel = providerLabelFor(
    account.provider,
    account.provider_label,
  );

  const bankMap = useMemo(() => {
    const m = new Map<string, BankAccount>();
    for (const b of bankAccounts) m.set(b.id, b);
    return m;
  }, [bankAccounts]);

  // KPIs
  const kpis = useMemo(() => {
    let total = 0;
    let units = 0;
    let anyUnits = false;
    const monthsSeen = new Set<string>();
    for (const b of bills) {
      total += b.amount;
      monthsSeen.add(monthKey(b.expense_date));
      if (b.units_consumed != null) {
        anyUnits = true;
        units += b.units_consumed;
      }
    }
    const monthSpan = monthsSeen.size || 1;
    return {
      count: bills.length,
      total,
      totalUnits: anyUnits ? units : null,
      avgPerMonth: total / monthSpan,
    };
  }, [bills]);

  // Monthly trend — one row per calendar month for the last 24 months.
  // Months with no bill simply render with em-dashes so the table reads
  // like a printed ledger. Delta-vs-previous is computed in chronological
  // order then reversed for display so the newest month sits at the top.
  const trend = useMemo(() => {
    // Build a calendar window of the last 24 months (oldest → newest)
    // so missing months still appear in the strip. Helps the auditor
    // see gaps in the billing record.
    const buckets = new Map<
      string,
      { amount: number; units: number | null; count: number }
    >();
    for (const b of bills) {
      const key = monthKey(b.expense_date);
      const cur = buckets.get(key) ?? { amount: 0, units: null, count: 0 };
      cur.amount += b.amount;
      cur.count += 1;
      if (b.units_consumed != null) {
        cur.units = (cur.units ?? 0) + b.units_consumed;
      }
      buckets.set(key, cur);
    }
    const months: { key: string; label: string }[] = [];
    const now = new Date();
    now.setDate(1);
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: monthLabel(key) });
    }
    // Drop leading empty months so a 3-month-old account doesn't render
    // 21 empty rows above the data. Keeps the table tight.
    let firstWithData = months.findIndex((m) => buckets.has(m.key));
    if (firstWithData < 0) firstWithData = months.length;
    const visible = months.slice(firstWithData);
    const rows = visible.map((m, idx) => {
      const cur = buckets.get(m.key);
      const prev = idx > 0 ? buckets.get(visible[idx - 1].key) : null;
      const deltaAmount =
        cur && prev ? cur.amount - prev.amount : null;
      const deltaUnits =
        cur && cur.units != null && prev && prev.units != null
          ? cur.units - prev.units
          : null;
      return {
        key: m.key,
        label: m.label,
        amount: cur?.amount ?? null,
        units: cur?.units ?? null,
        deltaAmount,
        deltaUnits,
      };
    });
    // Newest first for display.
    return rows.reverse();
  }, [bills]);

  return (
    <div className="space-y-6">
      {/* Back link — keeps the breadcrumb minimal so the printed-document
          chrome stays uncluttered. */}
      <div>
        <Link
          href="/admin/bill-accounts"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Bill Accounts
        </Link>
      </div>

      {/* Hero */}
      <div className="card-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {providerLabel}
              {account.is_active ? "" : " · Inactive"}
            </div>
            <h1>{account.nickname}</h1>
            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Account #{account.account_number}</span>
              {account.location && <span>· {account.location}</span>}
            </div>
            {account.notes && (
              <p className="text-sm text-muted-foreground mt-2 max-w-prose">
                {account.notes}
              </p>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            Created {formatDate(account.created_at)}
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card-soft py-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Bills on file
          </div>
          <div className="text-2xl font-semibold mt-1">{kpis.count}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Last 24 months
          </div>
        </div>
        <div className="card-soft py-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Total amount
          </div>
          <div className="text-2xl font-semibold mt-1">
            {formatLakh(kpis.total)}
          </div>
        </div>
        <div className="card-soft py-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Total units
          </div>
          <div className="text-2xl font-semibold mt-1">
            {kpis.totalUnits != null
              ? `${formatUnits(kpis.totalUnits)} ${UNITS_LABEL}`
              : "—"}
          </div>
        </div>
        <div className="card-soft py-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Avg / month
          </div>
          <div className="text-2xl font-semibold mt-1">
            {formatLakh(kpis.avgPerMonth)}
          </div>
        </div>
      </div>

      {/* Monthly trend — numeric mini-table styled as a printed ledger.
          One row per calendar month with amount, units (when applicable)
          and delta-vs-previous-month arrows so an auditor spots leaks /
          spikes at a glance. */}
      <div className="card-soft">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Monthly trend</h2>
            <p className="text-xs text-muted-foreground">
              Delta vs previous month
            </p>
          </div>
        </div>
        {trend.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No bills recorded against this account yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="px-2 py-2">Month</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2 text-right">Δ amount</th>
                  <th className="px-2 py-2 text-right">Units</th>
                  <th className="px-2 py-2 text-right">Δ units</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((r) => (
                  <tr
                    key={r.key}
                    className="border-b border-border last:border-0 hover:bg-secondary/50"
                  >
                    <td className="px-2 py-2 whitespace-nowrap">{r.label}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {r.amount != null ? formatCurrency(r.amount) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <DeltaCell value={r.deltaAmount} kind="amount" />
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {r.units != null
                        ? `${formatUnits(r.units)} ${UNITS_LABEL}`
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <DeltaCell value={r.deltaUnits} kind="units" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bills table */}
      <div className="card-soft">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">All bills</h2>
            <p className="text-xs text-muted-foreground">
              Most recent first
            </p>
          </div>
        </div>
        {bills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bills recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Bills for this account">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="px-2 py-2">Date paid</th>
                  <th className="px-2 py-2">Due date</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2 text-right">Units</th>
                  <th className="px-2 py-2">Paid from</th>
                  <th className="px-2 py-2">Voucher #</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => {
                  const daysLate = b.due_date
                    ? daysBetween(b.due_date, b.expense_date)
                    : null;
                  const isLate = daysLate != null && daysLate > 0;
                  return (
                  <tr
                    key={b.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/50"
                  >
                    <td className="px-2 py-2 whitespace-nowrap">
                      {formatDate(b.expense_date)}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      {b.due_date ? formatDate(b.due_date) : "—"}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {b.due_date == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : isLate ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                          Late {daysLate} day{daysLate === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20">
                          On time
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">{b.description || "—"}</td>
                    <td className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                      {formatCurrency(b.amount)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {b.units_consumed != null
                        ? `${formatUnits(b.units_consumed)} ${UNITS_LABEL}`
                        : "—"}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      {b.bank_account_id
                        ? bankMap.get(b.bank_account_id)?.name ?? "—"
                        : "—"}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      BILL-{b.id.slice(0, 8).toUpperCase()}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Tiny delta cell — green down-arrow when usage / spend dropped vs
// previous month, red up-arrow when it went up, muted dash when there's
// no previous month to compare against. Plain text fallback in the
// `aria-label` so screen readers describe the trend out loud.
function DeltaCell({
  value,
  kind,
}: {
  value: number | null;
  kind: "amount" | "units";
}) {
  if (value == null) {
    return (
      <span className="text-muted-foreground" aria-label="No previous month">
        <Minus className="inline w-3.5 h-3.5" />
      </span>
    );
  }
  if (value === 0) {
    return (
      <span className="text-muted-foreground" aria-label="No change">
        0
      </span>
    );
  }
  const isUp = value > 0;
  const cls = isUp ? "text-destructive" : "text-success";
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;
  const display =
    kind === "amount"
      ? formatCurrency(Math.abs(value))
      : formatUnits(Math.abs(value));
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${cls}`}
      aria-label={`${isUp ? "Up" : "Down"} ${display}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {display}
    </span>
  );
}
