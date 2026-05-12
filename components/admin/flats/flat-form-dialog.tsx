"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { createFlat, updateFlat, type FlatInput } from "@/app/actions/flats";

export type FlatFormValues = FlatInput & { id?: string };

export function FlatFormDialog({
  trigger,
  initial,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  initial?: FlatFormValues;
  open?: boolean;
  onOpenChange?: (b: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [flat_number, setFlatNumber] = useState(initial?.flat_number ?? "");
  const [floor, setFloor] = useState<string>(
    initial?.floor != null ? String(initial.floor) : "",
  );
  const [block, setBlock] = useState(initial?.block ?? "");
  const [size_sqft, setSize] = useState<string>(
    initial?.size_sqft != null ? String(initial.size_sqft) : "",
  );
  const [monthly_fee, setMonthlyFee] = useState<string>(
    initial?.monthly_fee != null ? String(initial.monthly_fee) : "",
  );
  const [ownership_type, setOwnership] = useState<"owner" | "tenant" | "vacant">(
    initial?.ownership_type ?? "owner",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      try {
        const payload: FlatInput = {
          flat_number,
          floor: floor ? Number(floor) : null,
          block: block || null,
          size_sqft: size_sqft ? Number(size_sqft) : null,
          monthly_fee: monthly_fee ? Number(monthly_fee) : null,
          ownership_type,
          notes: notes || null,
        };
        if (initial?.id) {
          await updateFlat(initial.id, payload);
          toast({ title: "Flat updated" });
        } else {
          await createFlat(payload);
          toast({ title: "Flat created" });
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Could not save flat",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit Flat" : "Add Flat"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Flat number *</Label>
            <Input
              required
              value={flat_number}
              onChange={(e) => setFlatNumber(e.target.value)}
              placeholder="A-101"
            />
          </div>
          <div>
            <Label>Floor</Label>
            <Input
              type="number"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
            />
          </div>
          <div>
            <Label>Block</Label>
            <Input value={block} onChange={(e) => setBlock(e.target.value)} />
          </div>
          <div>
            <Label>Size (sqft)</Label>
            <Input
              type="number"
              value={size_sqft}
              onChange={(e) => setSize(e.target.value)}
            />
          </div>
          <div>
            <Label>Monthly fee (PKR, optional)</Label>
            <Input
              type="number"
              value={monthly_fee}
              onChange={(e) => setMonthlyFee(e.target.value)}
              placeholder="Defaults to building fee"
            />
          </div>
          <div className="col-span-2">
            <Label>Status</Label>
            <Select
              value={ownership_type}
              onValueChange={(v) => setOwnership(v as "owner" | "tenant" | "vacant")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner-occupied</SelectItem>
                <SelectItem value="tenant">Tenant-occupied</SelectItem>
                <SelectItem value="vacant">Vacant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter className="col-span-2 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : initial?.id ? "Save changes" : "Create flat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
