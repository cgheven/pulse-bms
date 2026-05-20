"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  createVehicle,
  updateVehicle,
  type VehicleInput,
} from "@/app/actions/vehicles";
import type { VehicleType } from "@/types";
import { VEHICLE_TYPE_LABELS } from "@/types";

export type VehicleFormValues = VehicleInput & { id?: string };

export type FlatOption = { id: string; flat_number: string };
export type ResidentOption = {
  id: string;
  flat_id: string;
  full_name: string;
};

const TYPE_OPTIONS: VehicleType[] = ["car", "bike", "ev", "other"];

export function VehicleFormDialog({
  trigger,
  initial,
  flats,
  residents,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  initial?: VehicleFormValues;
  flats: FlatOption[];
  residents: ResidentOption[];
  open?: boolean;
  onOpenChange?: (b: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [flat_id, setFlatId] = useState(initial?.flat_id ?? flats[0]?.id ?? "");
  const [resident_id, setResidentId] = useState<string>(
    initial?.resident_id ?? "",
  );
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

  // When flat changes, reset resident if it doesn't belong to that flat
  useEffect(() => {
    if (!resident_id) return;
    const r = residents.find((x) => x.id === resident_id);
    if (!r || r.flat_id !== flat_id) setResidentId("");
  }, [flat_id, resident_id, residents]);

  const flatResidents = useMemo(
    () => residents.filter((r) => r.flat_id === flat_id),
    [residents, flat_id],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flat_id) {
      toast({ title: "Pick a flat", variant: "destructive" });
      return;
    }
    if (!plate_number.trim()) {
      toast({ title: "Number plate is required", variant: "destructive" });
      return;
    }
    start(async () => {
      try {
        const payload: VehicleInput = {
          flat_id,
          resident_id: resident_id || null,
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
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Error",
          description: friendlyErrorMessage(err, "Could not save vehicle"),
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial?.id ? "Edit Vehicle" : "Add Vehicle"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Flat *</Label>
            <Select value={flat_id} onValueChange={setFlatId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a flat" />
              </SelectTrigger>
              <SelectContent>
                {flats.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.flat_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label>Owner (resident)</Label>
            <Select
              value={resident_id || "none"}
              onValueChange={(v) => setResidentId(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a resident (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {flatResidents.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {flat_id && flatResidents.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No residents on this flat yet.
              </p>
            )}
          </div>

          <div>
            <Label>Number plate *</Label>
            <Input
              required
              maxLength={20}
              value={plate_number}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="AKD-123"
              className="uppercase tracking-wider"
            />
          </div>
          <div>
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
          <div>
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
              Mark as primary vehicle for this flat
            </label>
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
              {pending ? "Saving..." : initial?.id ? "Save changes" : "Add vehicle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
