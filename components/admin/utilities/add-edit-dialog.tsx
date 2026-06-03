"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  upsertUtilityAccount,
  type UtilityType,
  type UtilityAccountRow,
} from "@/app/actions/utilities";

interface Props {
  mode: "add" | "edit";
  initial?: UtilityAccountRow | null;
  types: UtilityType[];
  flats: { id: string; flat_number: string; floor: number | null }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY = {
  flat_id: "",
  utility_type_id: "",
  account_number: "",
  account_holder_name: "",
  notes: "",
};

export function AddEditDialog({
  mode,
  initial,
  types,
  flats,
  open,
  onOpenChange,
}: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [flatId, setFlatId] = useState(EMPTY.flat_id);
  const [utilityTypeId, setUtilityTypeId] = useState(EMPTY.utility_type_id);
  const [accountNumber, setAccountNumber] = useState(EMPTY.account_number);
  const [accountHolderName, setAccountHolderName] = useState(
    EMPTY.account_holder_name
  );
  const [notes, setNotes] = useState(EMPTY.notes);

  // Populate form when editing
  useEffect(() => {
    if (open && initial) {
      setFlatId(initial.flat_id);
      setUtilityTypeId(initial.utility_type_id);
      setAccountNumber(initial.account_number);
      setAccountHolderName(initial.account_holder_name ?? "");
      setNotes(initial.notes ?? "");
    } else if (open && !initial) {
      setFlatId(EMPTY.flat_id);
      setUtilityTypeId(EMPTY.utility_type_id);
      setAccountNumber(EMPTY.account_number);
      setAccountHolderName(EMPTY.account_holder_name);
      setNotes(EMPTY.notes);
    }
  }, [open, initial]);

  function handleClose(val: boolean) {
    if (!isPending) onOpenChange(val);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!flatId) {
      toast({ title: "Required", description: "Please select a flat.", variant: "destructive" });
      return;
    }
    if (!utilityTypeId) {
      toast({ title: "Required", description: "Please select a utility type.", variant: "destructive" });
      return;
    }
    if (!accountNumber.trim()) {
      toast({ title: "Required", description: "Account number is required.", variant: "destructive" });
      return;
    }

    startTransition(async () => {
      try {
        await upsertUtilityAccount({
          flat_id: flatId,
          utility_type_id: utilityTypeId,
          account_number: accountNumber.trim(),
          account_holder_name: accountHolderName.trim() || null,
          notes: notes.trim() || null,
        });
        toast({
          title: mode === "add" ? "Account Added" : "Account Updated",
          description:
            mode === "add"
              ? "Utility account has been saved."
              : "Utility account has been updated.",
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Error",
          description: friendlyErrorMessage(err, "Could not save utility account. Please try again."),
          variant: "destructive",
        });
      }
    });
  }

  const isEdit = mode === "edit";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {isEdit ? "Edit Utility Account" : "Add Utility Account"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Flat */}
          <div className="space-y-1.5">
            <Label className="text-base" htmlFor="flat-select">
              Flat <span className="text-destructive">*</span>
            </Label>
            <select
              id="flat-select"
              required
              disabled={isEdit || isPending}
              value={flatId}
              onChange={(e) => setFlatId(e.target.value)}
              className="h-12 text-base w-full border border-border rounded-lg px-3 bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">Select a flat...</option>
              {flats.map((f) => (
                <option key={f.id} value={f.id}>
                  Flat {f.flat_number}
                  {f.floor != null ? ` — Floor ${f.floor}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Utility Type */}
          <div className="space-y-1.5">
            <Label className="text-base" htmlFor="utility-type-select">
              Utility Type <span className="text-destructive">*</span>
            </Label>
            <select
              id="utility-type-select"
              required
              disabled={isEdit || isPending}
              value={utilityTypeId}
              onChange={(e) => setUtilityTypeId(e.target.value)}
              className="h-12 text-base w-full border border-border rounded-lg px-3 bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">Select utility type...</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.code ? ` (${t.code})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Account Number */}
          <div className="space-y-1.5">
            <Label className="text-base" htmlFor="account-number">
              Account Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="account-number"
              required
              disabled={isPending}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="e.g. 12345678901"
              className="h-12 text-base"
            />
          </div>

          {/* Account Holder Name */}
          <div className="space-y-1.5">
            <Label className="text-base" htmlFor="account-holder">
              Account Holder Name{" "}
              <span className="text-muted-foreground text-sm">(optional)</span>
            </Label>
            <Input
              id="account-holder"
              disabled={isPending}
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
              placeholder="e.g. Ahmed Khan"
              className="h-12 text-base"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-base" htmlFor="notes">
              Notes{" "}
              <span className="text-muted-foreground text-sm">(optional)</span>
            </Label>
            <textarea
              id="notes"
              rows={2}
              disabled={isPending}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional details..."
              className="text-base w-full border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 resize-none"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-12 text-base"
              onClick={() => handleClose(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="btn-big"
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Save Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
