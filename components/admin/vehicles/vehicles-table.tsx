"use client";

import Link from "next/link";
import { useState, useTransition, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Star, Pencil, Trash2, Car } from "lucide-react";
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
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Input
          placeholder="Search by plate number..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-md"
        />
        <Button
          className="btn-big shrink-0"
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

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Star className="w-3 h-3 text-warning fill-warning" />
        <span>= Primary vehicle for the flat</span>
      </div>

      <div className="card-soft p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Plate</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Make / Model</th>
                <th className="px-4 py-3 font-semibold">Color</th>
                <th className="px-4 py-3 font-semibold">Flat</th>
                <th className="px-4 py-3 font-semibold">Owner</th>
                <th className="px-4 py-3 font-semibold">Added</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 && (
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
              {vehicles.map((v) => {
                const makeModel =
                  [v.make, v.model].filter(Boolean).join(" ").trim() || "—";
                return (
                  <tr
                    key={v.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/50"
                  >
                    <td className="px-4 py-3 font-semibold tabular-nums tracking-wider">
                      {v.plate_number}
                      {v.is_primary && (
                        <span
                          title="Primary vehicle for this flat"
                          aria-label="Primary"
                        >
                          <Star className="inline-block w-3.5 h-3.5 ml-1.5 -mt-0.5 text-warning fill-warning" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {VEHICLE_TYPE_LABELS[v.vehicle_type]}
                    </td>
                    <td className="px-4 py-3">{makeModel}</td>
                    <td className="px-4 py-3">{v.color ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
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
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(v.created_at)}
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
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
