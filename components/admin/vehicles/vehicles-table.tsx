"use client";

import Link from "next/link";
import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { Plus, Search, Pencil, Trash2, Car } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { VEHICLE_TYPE_LABELS, type VehicleType } from "@/types";
import { deleteVehicle } from "@/app/actions/vehicles";
import {
  VehicleFormDialog,
  type FlatOption,
  type ResidentOption,
  type VehicleFormValues,
} from "./vehicle-form-dialog";

export type VehicleRow = {
  id: string;
  flat_id: string;
  resident_id: string | null;
  plate_number: string;
  vehicle_type: VehicleType;
  make: string | null;
  model: string | null;
  color: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  flat_number: string | null;
  resident_name: string | null;
};

export function VehiclesTable({
  vehicles,
  flats,
  residents,
  initialQuery,
}: {
  vehicles: VehicleRow[];
  flats: FlatOption[];
  residents: ResidentOption[];
  initialQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [q, setQ] = useState(initialQuery);
  const [flatFilter, setFlatFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VehicleFormValues | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VehicleRow | null>(null);
  const [deleting, startDelete] = useTransition();

  // Debounced URL update — pushes ?q= into the URL so the server re-fetches
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = q.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const next = params.toString();
      const target = next ? `${pathname}?${next}` : pathname;
      // Avoid pushing identical URLs
      const current = searchParams.toString();
      if (current !== next) router.replace(target, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [q, pathname, router, searchParams]);

  // Flat + Type narrow the server's search result further, client-side. Flat
  // options come from the vehicles on screen so the list never offers a flat
  // with no vehicle; Type is the fixed set of vehicle types.
  const flatOptions = useMemo(
    () =>
      Array.from(
        new Set(vehicles.map((v) => v.flat_number).filter((n): n is string => !!n)),
      ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [vehicles],
  );

  const displayed = useMemo(
    () =>
      vehicles.filter((v) => {
        if (flatFilter !== "all" && v.flat_number !== flatFilter) return false;
        if (typeFilter !== "all" && v.vehicle_type !== typeFilter) return false;
        return true;
      }),
    [vehicles, flatFilter, typeFilter],
  );

  const hasFilters =
    flatFilter !== "all" || typeFilter !== "all" || q.trim() !== "";
  const clearFilters = () => {
    setQ("");
    setFlatFilter("all");
    setTypeFilter("all");
  };

  function handleDelete() {
    if (!deleteTarget) return;
    startDelete(async () => {
      try {
        await deleteVehicle(deleteTarget.id);
        toast({
          title: "Vehicle deleted",
          description: `${deleteTarget.plate_number} removed.`,
        });
        setDeleteTarget(null);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not delete",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  // Edit / delete — shared by the desktop table and the mobile cards.
  function renderActions(v: VehicleRow) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={() =>
            setEditTarget({
              id: v.id,
              flat_id: v.flat_id,
              resident_id: v.resident_id,
              plate_number: v.plate_number,
              vehicle_type: v.vehicle_type,
              make: v.make,
              model: v.model,
              color: v.color,
              is_primary: v.is_primary,
              notes: v.notes,
            })
          }
          title="Edit vehicle"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Edit</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setDeleteTarget(v)}
          title="Delete vehicle"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Delete</span>
        </Button>
      </div>
    );
  }

  const PrimaryBadge = (
    <span className="shrink-0 rounded-full border border-warning/30 bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
      Primary
    </span>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar — search, filters and the add action share one full-width row */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by plate number..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          {flatOptions.length > 0 && (
            <Select value={flatFilter} onValueChange={setFlatFilter}>
              <SelectTrigger
                className="h-10 flex-1 min-w-[7.5rem] lg:flex-none lg:w-[9rem]"
                aria-label="Filter by flat"
              >
                <SelectValue placeholder="Flat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All flats</SelectItem>
                {flatOptions.map((fn) => (
                  <SelectItem key={fn} value={fn}>
                    {fn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger
              className="h-10 flex-1 min-w-[7.5rem] lg:flex-none lg:w-[9rem]"
              aria-label="Filter by type"
            >
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
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
        </div>

        <Button
          className="btn-big shrink-0 lg:ml-1"
          onClick={() => setAddOpen(true)}
          disabled={flats.length === 0}
        >
          <Plus className="w-5 h-5" />
          Add Vehicle
        </Button>
        <VehicleFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          flats={flats}
          residents={residents}
        />
      </div>

      {/* Live count */}
      <div className="flex items-center justify-end text-xs text-muted-foreground">
        <span className="tabular-nums">
          {displayed.length} of {vehicles.length}
        </span>
      </div>

      {/* Mobile card list — the 8-column table is too wide for a phone */}
      <div className="space-y-2 sm:hidden">
        {displayed.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-3 py-10 text-center text-sm text-muted-foreground">
            <Car className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No vehicles found.
          </div>
        ) : (
          displayed.map((v) => {
            const makeModel = [v.make, v.model].filter(Boolean).join(" ").trim();
            const spec = [makeModel || null, v.color ?? null].filter(Boolean).join(" · ");
            return (
              <div key={v.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold tabular-nums tracking-wider">{v.plate_number}</span>
                    {v.is_primary && PrimaryBadge}
                  </div>
                  <span className="shrink-0 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {VEHICLE_TYPE_LABELS[v.vehicle_type]}
                  </span>
                </div>

                {spec && <p className="mt-1 text-sm capitalize">{spec}</p>}

                <p className="mt-1 text-xs text-muted-foreground">
                  {v.flat_number ? (
                    <Link href={`/admin/flats/${v.flat_id}`} className="text-primary/90 hover:underline tabular-nums">
                      Flat {v.flat_number}
                    </Link>
                  ) : (
                    "No flat"
                  )}
                  <span className="mx-1 text-muted-foreground/40">·</span>
                  {v.resident_id && v.resident_name ? (
                    <Link href={`/admin/residents/${v.resident_id}`} className="text-primary/90 hover:underline">
                      {v.resident_name}
                    </Link>
                  ) : (
                    "Unassigned"
                  )}
                </p>

                <div className="mt-2.5 flex items-center justify-end border-t border-border/60 pt-2">
                  {renderActions(v)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block card-soft p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 border-b border-border">
              <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">Plate</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Make / Model</th>
                <th className="px-4 py-2.5">Color</th>
                <th className="px-4 py-2.5">Flat</th>
                <th className="px-4 py-2.5">Owner</th>
                <th className="px-4 py-2.5">Added</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <Car className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No vehicles found.
                  </td>
                </tr>
              )}
              {displayed.map((v) => {
                const makeModel =
                  [v.make, v.model].filter(Boolean).join(" ").trim() || "—";
                return (
                  <tr
                    key={v.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/50"
                  >
                    <td className="px-4 py-2.5 font-semibold tabular-nums tracking-wider whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        {v.plate_number}
                        {v.is_primary && PrimaryBadge}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {VEHICLE_TYPE_LABELS[v.vehicle_type]}
                    </td>
                    <td className="px-4 py-2.5">{makeModel}</td>
                    <td className="px-4 py-2.5 capitalize">{v.color ?? "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {v.flat_number ? (
                        <Link
                          href={`/admin/flats/${v.flat_id}`}
                          className="text-primary hover:underline tabular-nums"
                        >
                          {v.flat_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {v.resident_id && v.resident_name ? (
                        <Link
                          href={`/admin/residents/${v.resident_id}`}
                          className="text-primary hover:underline"
                        >
                          {v.resident_name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap tabular-nums">
                      {formatDate(v.created_at)}
                    </td>
                    <td className="px-4 py-2.5">{renderActions(v)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editTarget && (
        <VehicleFormDialog
          open={Boolean(editTarget)}
          onOpenChange={(o) => !o && setEditTarget(null)}
          flats={flats}
          residents={residents}
          initial={editTarget}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete vehicle ${deleteTarget?.plate_number}?`}
        description="This permanently removes the vehicle record. You cannot undo this."
        confirmLabel={deleting ? "Deleting…" : "Delete vehicle"}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
