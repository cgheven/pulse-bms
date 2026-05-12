"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, Pencil, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { BuildingFormDialog, type BuildingFormValues } from "./building-form-dialog";
import { setBuildingActive } from "@/app/actions/super-admin";

export function BuildingRowActions({
  building,
}: {
  building: BuildingFormValues & { id: string; is_active: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      try {
        await setBuildingActive(building.id, !building.is_active);
        toast({
          title: building.is_active ? "Building deactivated" : "Building re-activated",
        });
        setConfirmOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not update",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button asChild variant="ghost" size="sm" className="h-9">
        <Link href={`/super-admin/buildings/${building.id}`}>
          <Eye className="w-4 h-4" />
          View
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-9"
        onClick={() => setEditOpen(true)}
      >
        <Pencil className="w-4 h-4" />
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 text-destructive hover:text-destructive"
        onClick={() => setConfirmOpen(true)}
      >
        {building.is_active ? (
          <>
            <PowerOff className="w-4 h-4" />
            Deactivate
          </>
        ) : (
          <>
            <Power className="w-4 h-4" />
            Activate
          </>
        )}
      </Button>

      <BuildingFormDialog
        mode="edit"
        initial={building}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <ConfirmDialog
        open={confirmOpen}
        title={building.is_active ? "Deactivate building?" : "Re-activate building?"}
        description={
          building.is_active
            ? "Residents and admins will lose access until you re-activate this building."
            : "This will restore access for residents and admins."
        }
        confirmLabel={
          isPending
            ? "Working..."
            : building.is_active
            ? "Deactivate"
            : "Activate"
        }
        onConfirm={toggleActive}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export function CreateBuildingButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="btn-big" onClick={() => setOpen(true)}>
        + Add Building
      </Button>
      <BuildingFormDialog mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}
