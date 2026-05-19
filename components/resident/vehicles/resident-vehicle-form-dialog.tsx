"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  createVehicle,
  updateVehicle,
  type VehicleInput,
} from "@/app/actions/vehicles";
import type { VehicleType } from "@/types";
import { VEHICLE_TYPE_LABELS } from "@/types";

export type ResidentVehicleFormValues = {
  id?: string;
  plate_number: string;
  vehicle_type: VehicleType;
  make?: string | null;
  model?: string | null;
  color?: string | null;
  is_primary?: boolean;
  notes?: string | null;
};

const TYPE_OPTIONS: VehicleType[] = ["car", "bike", "ev", "other"];

export function ResidentVehicleFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  initial?: ResidentVehicleFormValues;
}) {
  const [plate_number, setPlate] = useState(initial?.plate_number ?? "");
  const [vehicle_type, setVehicleType] = useState<VehicleType>(
    initial?.vehicle_type ?? "car",
  );
  const [make, setMake] = useState(initial?.make ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [color, setColor] = useState(initial?.color ?? "");
  const [is_primary, setIsPrimary] = useState(initial?.is_primary ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!plate_number.trim()) {
      toast({ title: "Number plate is required", variant: "destructive" });
      return;
    }
    start(async () => {
      try {
        const payload: VehicleInput = {
          plate_number,
          vehicle_type,
          make: make || null,
          model: model || null,
          color: color || null,
          is_primary,
          notes: notes || null,
        };
        if (initial?.id) {
          await updateVehicle(initial.id, payload);
          toast({ title: "Vehicle updated" });
        } else {
          await createVehicle(payload);
          toast({ title: "Vehicle added" });
        }
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Could not save vehicle",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial?.id ? "Edit Vehicle" : "Add Vehicle"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Number plate *</Label>
            <Input
              required
              maxLength={20}
              value={plate_number}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="AKD-123"
              className="uppercase tracking-wider text-base"
            />
          </div>
          <div className="col-span-2">
            <Label>Type *</Label>
            <Select
              value={vehicle_type}
              onValueChange={(v) => setVehicleType(v as VehicleType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {VEHICLE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Make</Label>
            <Input
              maxLength={100}
              value={make}
              onChange={(e) => setMake(e.target.value)}
              placeholder="Honda"
            />
          </div>
          <div>
            <Label>Model</Label>
            <Input
              maxLength={100}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Civic"
            />
          </div>
          <div className="col-span-2">
            <Label>Color</Label>
            <Input
              maxLength={100}
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="White"
            />
          </div>

          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any other details (optional)"
              maxLength={500}
            />
          </div>

          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={is_primary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="h-4 w-4"
              />
              This is my primary vehicle
            </label>
          </div>

          <DialogFooter className="col-span-2 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending} className="btn-big">
              {pending ? "Saving..." : initial?.id ? "Save changes" : "Add vehicle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
