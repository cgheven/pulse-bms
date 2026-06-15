"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { Star, Pencil, Trash2, Car } from "lucide-react";
import { VEHICLE_TYPE_LABELS, type VehicleType } from "@/types";
import { deleteVehicle } from "@/app/actions/vehicles";
import {
  ResidentVehicleFormDialog,
  type ResidentVehicleFormValues,
} from "./resident-vehicle-form-dialog";

export type ResidentVehicleRow = {
  id: string;
  plate_number: string;
  vehicle_type: VehicleType;
  make: string | null;
  model: string | null;
  color: string | null;
  is_primary: boolean;
  notes: string | null;
};

export function ResidentVehiclesList({
  vehicles,
}: {
  vehicles: ResidentVehicleRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editTarget, setEditTarget] = useState<ResidentVehicleFormValues | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<ResidentVehicleRow | null>(
    null,
  );
  const [deleting, startDelete] = useTransition();

  function handleDelete() {
    if (!deleteTarget) return;
    startDelete(async () => {
      try {
        await deleteVehicle(deleteTarget.id);
        toast({
          title: "Vehicle removed",
          description: `${deleteTarget.plate_number} has been deleted.`,
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

  return (
    <div className="space-y-4">
      {vehicles.length === 0 ? (
        <div className="card-soft text-center py-12">
          <Car className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-base font-medium text-foreground">
            No vehicles registered yet.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Add your car, bike or EV so the building knows it belongs here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {vehicles.map((v) => {
            const makeModel = [v.make, v.model].filter(Boolean).join(" ").trim();
            return (
              <div key={v.id} className="card-soft card-hover">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xl font-bold tabular-nums tracking-wider">
                        {v.plate_number}
                      </span>
                      {v.is_primary && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider text-warning bg-warning/10 border border-warning/30"
                          title="Primary vehicle"
                        >
                          <Star className="w-3 h-3 fill-warning" />
                          Primary
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 capitalize">
                      {VEHICLE_TYPE_LABELS[v.vehicle_type]}
                      {makeModel && <> · {makeModel}</>}
                      {v.color && <> · {v.color}</>}
                    </p>
                    {v.notes && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                        {v.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() =>
                        setEditTarget({
                          id: v.id,
                          plate_number: v.plate_number,
                          vehicle_type: v.vehicle_type,
                          make: v.make,
                          model: v.model,
                          color: v.color,
                          is_primary: v.is_primary,
                          notes: v.notes,
                        })
                      }
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(v)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editTarget && (
        <ResidentVehicleFormDialog
          open={Boolean(editTarget)}
          onOpenChange={(o) => !o && setEditTarget(null)}
          initial={editTarget}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.plate_number}?`}
        description="This permanently removes the vehicle from your record."
        confirmLabel={deleting ? "Deleting…" : "Delete vehicle"}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
