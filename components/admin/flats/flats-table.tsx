"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Plus, Pencil, Search } from "lucide-react";
import { cn, formatCurrency, formatLakh } from "@/lib/utils";
import { FlatFormDialog } from "./flat-form-dialog";

export type FlatRow = {
  id: string;
  flat_number: string;
  floor: number | null;
  block: string | null;
  size_sqft: number | null;
  monthly_fee: number | null;
  ownership_type: "owner" | "tenant" | "vacant";
  outstanding_dues: number;
  notes: string | null;
  primary_resident_name: string | null;
};

// Dark-theme HSL pills, consistent with the rest of the admin shell.
const STATUS_META: Record<
  string,
  { label: string; cls: string }
> = {
  owner: {
    label: "Owner",
    cls: "bg-[hsl(151_70%_55%/0.12)] text-[hsl(151_70%_55%)] border-[hsl(151_70%_55%/0.30)]",
  },
  tenant: {
    label: "Tenant",
    cls: "bg-[hsl(38_92%_55%/0.12)] text-[hsl(38_92%_65%)] border-[hsl(38_92%_55%/0.30)]",
  },
  vacant: {
    label: "Vacant",
    cls: "bg-muted/40 text-muted-foreground border-border",
  },
};

export function FlatsTable({
  flats,
  buildingDefaultFee,
  buildingName,
  flatLimit,
}: {
  flats: FlatRow[];
  buildingDefaultFee: number;
  buildingName: string;
  flatLimit: number;
}) {
  const [q, setQ] = useState("");
  const [block, setBlock] = useState("all");
  const [floor, setFloor] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<FlatRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Distinct blocks / floors actually present, so the dropdowns only ever
  // offer values that return rows. Blocks sort alphabetically, floors numeric.
  const blockOptions = useMemo(
    () =>
      Array.from(
        new Set(flats.map((f) => f.block).filter((b): b is string => !!b)),
      ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [flats],
  );
  const floorOptions = useMemo(
    () =>
      Array.from(
        new Set(flats.map((f) => f.floor).filter((n): n is number => n != null)),
      ).sort((a, b) => a - b),
    [flats],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return flats.filter((f) => {
      if (
        s &&
        !(
          f.flat_number.toLowerCase().includes(s) ||
          (f.block ?? "").toLowerCase().includes(s) ||
          (f.primary_resident_name ?? "").toLowerCase().includes(s)
        )
      )
        return false;
      if (block !== "all" && f.block !== block) return false;
      if (floor !== "all" && String(f.floor) !== floor) return false;
      if (status !== "all" && f.ownership_type !== status) return false;
      return true;
    });
  }, [flats, q, block, floor, status]);

  const hasFilters = block !== "all" || floor !== "all" || status !== "all" || q.trim() !== "";
  const clearFilters = () => {
    setQ("");
    setBlock("all");
    setFloor("all");
    setStatus("all");
  };

  // 0 means unlimited (reserved for ops use via direct SQL)
  const isAtLimit = flatLimit > 0 && flats.length >= flatLimit;

  return (
    <>
      {/* Header — h1 inline with Add Flat. */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1>Flats</h1>
        <Button
          size="sm"
          onClick={() => !isAtLimit && setAddOpen(true)}
          disabled={isAtLimit}
          aria-disabled={isAtLimit}
          title={isAtLimit ? `Flat limit reached (${flatLimit}). Contact support to add more.` : undefined}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Flat
        </Button>
      </header>

      {isAtLimit && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-800"
        >
          You have reached the maximum of {flatLimit} flats allowed for this building.
          To add more flats, contact support.
        </div>
      )}

      {/* Search + filters on one row — search is capped so the filters and the
          result count share the space; wraps cleanly on mobile. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto sm:flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search flat / block / resident…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 pl-9 text-sm"
          />
        </div>

        {blockOptions.length > 0 && (
          <Select value={block} onValueChange={setBlock}>
            <SelectTrigger
              className="h-10 flex-1 min-w-[7.5rem] sm:flex-none sm:w-[8rem]"
              aria-label="Filter by block"
            >
              <SelectValue placeholder="Block" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All blocks</SelectItem>
              {blockOptions.map((b) => (
                <SelectItem key={b} value={b}>
                  Block {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {floorOptions.length > 0 && (
          <Select value={floor} onValueChange={setFloor}>
            <SelectTrigger
              className="h-10 flex-1 min-w-[7.5rem] sm:flex-none sm:w-[8rem]"
              aria-label="Filter by floor"
            >
              <SelectValue placeholder="Floor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All floors</SelectItem>
              {floorOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Floor {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger
            className="h-10 flex-1 min-w-[7.5rem] sm:flex-none sm:w-[8.5rem]"
            aria-label="Filter by status"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="tenant">Tenant</SelectItem>
            <SelectItem value="vacant">Vacant</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-10 text-xs text-muted-foreground shrink-0"
          >
            Clear
          </Button>
        )}

        <span className="text-xs text-muted-foreground tabular-nums shrink-0 sm:ml-auto">
          {filtered.length} of {flats.length}
        </span>
      </div>

      <FlatFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        buildingName={buildingName}
      />
      {editing && (
        <FlatFormDialog
          initial={editing}
          open={!!editing}
          onOpenChange={(b) => !b && setEditing(null)}
          buildingName={buildingName}
        />
      )}

      {/* Mobile card list — the table is too wide for a phone */}
      <div className="space-y-2 sm:hidden">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-3 py-10 text-center text-sm text-muted-foreground">
            No flats found.
          </div>
        ) : (
          filtered.map((f) => {
            const fee = f.monthly_fee ?? buildingDefaultFee;
            const status = STATUS_META[f.ownership_type] ?? STATUS_META.vacant;
            const location =
              [
                f.floor != null ? `Floor ${f.floor}` : null,
                f.block ? `Block ${f.block}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—";
            return (
              <div
                key={f.id}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/flats/${f.id}`}
                      prefetch
                      className="text-base font-semibold text-primary tabular-nums hover:underline"
                    >
                      {f.flat_number}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {location}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                      status.cls,
                    )}
                  >
                    {status.label}
                  </span>
                </div>

                <p className="mt-2 text-sm">
                  {f.primary_resident_name ?? (
                    <span className="text-muted-foreground">No resident</span>
                  )}
                </p>

                <div className="mt-3 flex items-end justify-between gap-2 border-t border-border/60 pt-2.5">
                  <div className="flex gap-4 text-xs">
                    <div>
                      <p className="text-muted-foreground">Maintenance</p>
                      <p className="mt-0.5 tabular-nums">
                        {formatCurrency(fee)}
                        {f.monthly_fee == null && (
                          <span className="ml-1 text-[10px] text-muted-foreground/70">
                            default
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Outstanding</p>
                      <p className="mt-0.5 tabular-nums">
                        {f.outstanding_dues > 0 ? (
                          <span className="font-semibold text-destructive">
                            {formatLakh(f.outstanding_dues)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1 text-xs"
                    onClick={() => setEditing(f)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 border-b border-border">
              <tr className="text-left">
                <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Flat
                </th>
                <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Location
                </th>
                <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Primary resident
                </th>
                <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Maintenance
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Outstanding
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-10 text-center text-muted-foreground"
                  >
                    No flats found.
                  </td>
                </tr>
              )}
              {filtered.map((f) => {
                const fee = f.monthly_fee ?? buildingDefaultFee;
                const status = STATUS_META[f.ownership_type] ?? STATUS_META.vacant;
                return (
                  <tr
                    key={f.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/40"
                  >
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                      <Link
                        href={`/admin/flats/${f.id}`}
                        prefetch
                        className="text-primary hover:underline tabular-nums"
                      >
                        {f.flat_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                      {[
                        f.floor != null ? `Floor ${f.floor}` : null,
                        f.block ? `Block ${f.block}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {f.primary_resident_name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                          status.cls,
                        )}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCurrency(fee)}
                      {f.monthly_fee == null && (
                        <span className="ml-1 text-[10px] text-muted-foreground/70">
                          default
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {f.outstanding_dues > 0 ? (
                        <span className="font-semibold text-destructive">
                          {formatLakh(f.outstanding_dues)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => setEditing(f)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
