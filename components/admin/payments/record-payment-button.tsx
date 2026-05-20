"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  RecordPaymentDialog,
  type FlatPickerOption,
  type PaymentCategoryDefault,
} from "./record-payment-dialog";

/**
 * Header button that opens the RecordPaymentDialog. Shared between the
 * Maintenance page and the Other Income page — the only difference is which
 * category the dialog should pre-select and the button label.
 */
export function RecordPaymentButton({
  flats,
  buildingName,
  buildingId,
  defaultCategory = "maintenance",
  label,
}: {
  flats: FlatPickerOption[];
  buildingName: string;
  buildingId: string;
  defaultCategory?: PaymentCategoryDefault;
  /** Override the default "Record Payment" button label. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonLabel =
    label ??
    (defaultCategory === "maintenance" ? "Record Payment" : "Record Other Payment");
  return (
    <>
      <Button className="btn-big shrink-0" onClick={() => setOpen(true)}>
        <Plus className="w-5 h-5" />
        {buttonLabel}
      </Button>
      <RecordPaymentDialog
        open={open}
        onOpenChange={setOpen}
        flats={flats}
        buildingName={buildingName}
        buildingId={buildingId}
        defaultCategory={defaultCategory}
      />
    </>
  );
}
