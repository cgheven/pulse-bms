"use client";

import { useState } from "react";
import {
  distributeLevy,
  markLevyChargePaid,
  waiveLevyCharge,
  cancelLevy,
} from "@/app/actions/levies";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusPill } from "@/components/resident/status-pill";
import { CheckCircle, Ban, Send, RefreshCw } from "lucide-react";

type LevyRow = {
  id: string;
  name: string;
  description: string | null;
  total_cost: number;
  fund_contribution: number;
  per_resident_amount: number | null;
  resident_count: number | null;
  is_recurring: boolean;
  recurrence_day: number | null;
  due_date: string;
  status: string;
  distributed_at: string | null;
};

type ChargeRow = {
  id: string;
  amount: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  bms_residents: { full_name: string } | { full_name: string }[] | null;
  bms_flats: { flat_number: string } | { flat_number: string }[] | null;
};

function residentName(r: ChargeRow["bms_residents"]): string {
  if (!r) return "—";
  return Array.isArray(r) ? (r[0]?.full_name ?? "—") : r.full_name;
}

function flatNumber(f: ChargeRow["bms_flats"]): string {
  if (!f) return "—";
  return Array.isArray(f) ? (f[0]?.flat_number ?? "—") : f.flat_number;
}

interface Props {
  levy: LevyRow;
  charges: ChargeRow[];
  activeResidentCount: number;
}

export function LevyDetailClient({ levy, charges, activeResidentCount }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [globalPending, setGlobalPending] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  function runRowPending(id: string, on: boolean) {
    setPendingIds((prev) => {
      const s = new Set(prev);
      if (on) s.add(id);
      else s.delete(id);
      return s;
    });
  }

  async function runGlobal(fn: () => Promise<void>) {
    setError(null);
    setGlobalPending(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGlobalPending(false);
    }
  }

  async function runRow(chargeId: string, fn: () => Promise<void>) {
    setError(null);
    runRowPending(chargeId, true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      runRowPending(chargeId, false);
    }
  }

  const isDraft = levy.status === "draft";
  const isDistributed = levy.status === "distributed";
  const residentShare = Number(levy.total_cost) - Number(levy.fund_contribution);

  // Per-resident: actual once distributed, otherwise a live estimate from the
  // current active-resident headcount so admins see it before sending.
  const perResidentActual = levy.per_resident_amount;
  const perResidentEstimate =
    residentShare > 0 && activeResidentCount > 0
      ? residentShare / activeResidentCount
      : 0;
  const perResidentValue =
    perResidentActual != null ? perResidentActual : perResidentEstimate;
  const perResidentDisplay =
    residentShare <= 0
      ? "Rs. 0"
      : perResidentActual == null && activeResidentCount === 0
        ? "—"
        : formatCurrency(perResidentValue);

  const paidCount = charges.filter((c) => c.status === "paid").length;
  const waivedCount = charges.filter((c) => c.status === "waived").length;
  const pendingCount = charges.filter((c) => c.status === "pending").length;
  const chargeableCount = charges.length - waivedCount;
  const totalCollected = charges
    .filter((c) => c.status === "paid")
    .reduce((s, c) => s + Number(c.amount), 0);
  const collectPct =
    chargeableCount > 0 ? Math.round((paidCount / chargeableCount) * 100) : 0;

  const headcount = levy.resident_count ?? activeResidentCount;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Compact stat strip — Per resident always shown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Stat label="Total cost" value={formatCurrency(levy.total_cost)} />
        <Stat
          label="Fund covers"
          value={formatCurrency(levy.fund_contribution)}
          valueClass="text-emerald-600"
        />
        <Stat
          label="Resident share"
          value={formatCurrency(residentShare)}
          valueClass={residentShare > 0 ? "text-amber-600" : "text-foreground"}
        />
        <Stat
          label={perResidentActual == null && isDraft ? "Per resident (est.)" : "Per resident"}
          value={perResidentDisplay}
          valueClass="text-primary"
        />
      </div>

      {/* Meta line */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Due <span className="text-foreground font-medium">{formatDate(levy.due_date)}</span>
        </span>
        <span>·</span>
        <span>
          {headcount} {headcount === 1 ? "resident" : "residents"}
          {isDistributed ? " charged" : ""}
        </span>
        {levy.distributed_at && (
          <>
            <span>·</span>
            <span>
              Sent{" "}
              <span className="text-foreground font-medium">
                {formatDate(levy.distributed_at)}
              </span>
            </span>
          </>
        )}
      </div>

      {/* Draft actions */}
      {isDraft && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => runGlobal(() => distributeLevy(levy.id))}
            disabled={globalPending}
            className="btn-big btn-primary flex items-center gap-2 text-sm disabled:opacity-60"
          >
            {globalPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Distribute to Residents
          </button>
          <button
            onClick={() => runGlobal(() => cancelLevy(levy.id))}
            disabled={globalPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-destructive/30 text-destructive text-sm hover:bg-destructive/5 disabled:opacity-60 transition-colors"
          >
            <Ban className="w-4 h-4" />
            Cancel
          </button>
        </div>
      )}

      {/* Distributed: collection summary + charges */}
      {isDistributed && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-semibold">Resident Charges</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {pendingCount} pending · {paidCount} paid
                {waivedCount > 0 ? ` · ${waivedCount} waived` : ""}
              </span>
            </div>
            {chargeableCount > 0 && (
              <div className="flex items-center gap-2 min-w-[180px]">
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${collectPct}%` }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {formatCurrency(totalCollected)}
                </span>
              </div>
            )}
          </div>

          {charges.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              No charges generated — fund covered the full cost.
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Resident</th>
                    <th className="px-4 py-2.5 font-medium">Flat</th>
                    <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((c) => {
                    const isRowPending = pendingIds.has(c.id);
                    return (
                      <tr
                        key={c.id}
                        className="border-t border-border hover:bg-secondary/40"
                      >
                        <td className="px-4 py-3 font-medium">
                          {residentName(c.bms_residents)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {flatNumber(c.bms_flats)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          {formatCurrency(Number(c.amount))}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={c.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {c.status === "pending" && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() =>
                                  runRow(c.id, () => markLevyChargePaid(c.id))
                                }
                                disabled={isRowPending}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-500 hover:bg-emerald-500/20 hover:border-emerald-500/50 disabled:opacity-50 transition-colors"
                              >
                                {isRowPending ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-3.5 h-3.5" />
                                )}
                                Mark paid
                              </button>
                              <button
                                onClick={() =>
                                  runRow(c.id, () => waiveLevyCharge(c.id))
                                }
                                disabled={isRowPending}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                Waive
                              </button>
                            </div>
                          )}
                          {c.status === "paid" && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {c.paid_at ? formatDate(c.paid_at) : "Paid"}
                            </span>
                          )}
                          {c.status === "waived" && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {levy.status === "cancelled" && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          This levy was cancelled — no charges were sent to residents.
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass = "text-foreground",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-base sm:text-lg font-semibold tracking-tight tabular-nums break-words ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

