"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ResidentVehicleFormDialog } from "./resident-vehicle-form-dialog";

/** Self-contained "Add Vehicle" trigger + dialog, so it can sit inline with the
 *  page title in the header (mirrors the complaints page layout). */
export function AddVehicleButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="btn-big gap-2" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" />
        Add Vehicle
      </Button>
      <ResidentVehicleFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
