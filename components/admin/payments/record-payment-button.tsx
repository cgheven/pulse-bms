"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordPaymentDialog, type FlatPickerOption } from "./record-payment-dialog";

export function RecordPaymentButton({
  flats,
  buildingName,
}: {
  flats: FlatPickerOption[];
  buildingName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="btn-big shrink-0" onClick={() => setOpen(true)}>
        <Plus className="w-5 h-5" />
        Record Payment
      </Button>
      <RecordPaymentDialog
        open={open}
        onOpenChange={setOpen}
        flats={flats}
        buildingName={buildingName}
      />
    </>
  );
}
