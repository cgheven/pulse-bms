"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from "lucide-react";
import { formatCurrency, formatLakh } from "@/lib/utils";
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

const STATUS_PILL: Record<string, string> = {
  owner: "status-info",
  tenant: "status-pending",
  vacant: "status-paid",
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Input
          placeholder="Search flat number / block / resident..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-md"
        />
        <Button className="btn-big shrink-0" onClick={() => setAddOpen(true)}>
          <Plus className="w-5 h-5" />
          Add Flat
        </Button>
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
      </div>

      <div className="card-soft p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Flat</th>
                <th className="px-4 py-3 font-semibold">Floor / Block</th>
                <th className="px-4 py-3 font-semibold">Primary Resident</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Monthly Fee</th>
                <th className="px-4 py-3 font-semibold text-right">Outstanding</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No flats found.
                  </td>
                </tr>
              )}
              {filtered.map((f) => {
                const fee = f.monthly_fee ?? buildingDefaultFee;
                return (
                  <tr key={f.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">
                      <Link href={`/admin/flats/${f.id}`} className="text-primary hover:underline tabular-nums">
                        {f.flat_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {f.floor != null ? `Floor ${f.floor}` : "—"}
                      {f.block ? ` · ${f.block}` : ""}
                    </td>
                    <td className="px-4 py-3">{f.primary_resident_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[f.ownership_type] ?? ""}`}>
                        {f.ownership_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(fee)}
                      {f.monthly_fee == null && (
                        <span className="ml-1 text-xs text-muted-foreground">(default)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {f.outstanding_dues > 0 ? (
                        <span className="font-semibold text-destructive">
                          {formatLakh(f.outstanding_dues)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Rs. 0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(f)}
                        aria-label="Edit flat"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
