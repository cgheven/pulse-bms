"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
}: {
  flats: FlatRow[];
  buildingDefaultFee: number;
  buildingName: string;
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<FlatRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return flats;
    return flats.filter(
      (f) =>
        f.flat_number.toLowerCase().includes(s) ||
        (f.block ?? "").toLowerCase().includes(s) ||
        (f.primary_resident_name ?? "").toLowerCase().includes(s),
    );
  }, [flats, q]);

  // Tiny aggregate row so the page header earns its space.
  const occupied = flats.filter((f) => f.ownership_type !== "vacant").length;
  const totalOutstanding = flats.reduce((s, f) => s + f.outstanding_dues, 0);

  return (
    <>
      {/* Header — h1 + meta inline with Add Flat. No standalone subtitle. */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1>Flats</h1>
          <p className="text-xs text-muted-foreground tabular-nums">
            {occupied} / {flats.length} occupied
            {totalOutstanding > 0 && (
              <>
                <span className="mx-1 text-muted-foreground/40">·</span>
                <span className="text-destructive">
                  {formatLakh(totalOutstanding)} outstanding
                </span>
              </>
            )}
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="w-3.5 h-3.5" />
          Add Flat
        </Button>
      </header>

      {/* Search row — inline count to use the right-side whitespace */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search flat / block / resident…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 pl-9 text-sm"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
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

      <div className="rounded-lg border border-border bg-card overflow-hidden">
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
                  Monthly fee
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
