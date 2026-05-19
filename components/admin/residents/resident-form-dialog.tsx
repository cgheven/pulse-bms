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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  createResident,
  updateResident,
  type ResidentInput,
} from "@/app/actions/residents";
import { createVehicle } from "@/app/actions/vehicles";
import type { VehicleType } from "@/types";

export type ResidentFormValues = ResidentInput & { id?: string };

export type FlatOption = { id: string; flat_number: string };

export function ResidentFormDialog({
  trigger,
  initial,
  flats,
  buildingDefaults,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  initial?: ResidentFormValues;
  flats: FlatOption[];
  buildingDefaults: { entry_fee_owner: number; entry_fee_tenant: number };
  open?: boolean;
  onOpenChange?: (b: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [flat_id, setFlatId] = useState(initial?.flat_id ?? flats[0]?.id ?? "");
  const [full_name, setFullName] = useState(initial?.full_name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [cnic, setCnic] = useState(initial?.cnic ?? "");
  // Coerce legacy "family" rows back to "owner" — the form no longer offers
  // family member as a choice, so opening an old record falls back to owner.
  const [relationship, setRelationship] = useState<"owner" | "tenant">(
    initial?.relationship === "tenant" ? "tenant" : "owner",
  );
  const [is_primary, setIsPrimary] = useState(initial?.is_primary ?? false);
  const [move_in_date, setMoveIn] = useState(initial?.move_in_date ?? "");
  const [move_out_date, setMoveOut] = useState(initial?.move_out_date ?? "");
  const [entry_fee_paid, setEntryFee] = useState<string>(
    initial?.entry_fee_paid != null ? String(initial.entry_fee_paid) : "0",
  );
  const [entryFeePaidTouched, setEntryFeePaidTouched] = useState(false);
  const [is_active, setActive] = useState(initial?.is_active ?? true);

  // Vehicle (optional, create-only). Skipped entirely on edit.
  const isEdit = Boolean(initial?.id);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("car");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [vehiclePrimary, setVehiclePrimary] = useState(true);

  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  // Auto-fill entry_fee_paid from defaults when relationship changes (only for new residents)
  useEffect(() => {
    if (initial?.id) return;
    if (entryFeePaidTouched) return;
    if (relationship === "owner") setEntryFee(String(buildingDefaults.entry_fee_owner));
    else if (relationship === "tenant") setEntryFee(String(buildingDefaults.entry_fee_tenant));
    else setEntryFee("0");
  }, [relationship, buildingDefaults, initial, entryFeePaidTouched]);

  const flatOptions = useMemo(() => flats, [flats]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flat_id) {
      toast({ title: "Pick a flat", variant: "destructive" });
      return;
    }
    start(async () => {
      try {
        const payload: ResidentInput = {
          flat_id,
          full_name,
          phone: phone || null,
          email: email || null,
          cnic: cnic || null,
          relationship,
          is_primary,
          move_in_date: move_in_date || null,
          move_out_date: move_out_date || null,
          entry_fee_paid: Number(entry_fee_paid) || 0,
          is_active,
        };
        if (initial?.id) {
          await updateResident(initial.id, payload);
          toast({ title: "Resident updated" });
        } else {
          const created = await createResident(payload);
          toast({ title: "Resident added" });

          // Optional vehicle on create. Plate empty → skip.
          // Resident creation already succeeded; surface vehicle failure
          // separately so the user can retry from /admin/vehicles.
          const plateTrimmed = vehiclePlate.trim();
          if (plateTrimmed && created?.id) {
            try {
              await createVehicle({
                flat_id,
                resident_id: created.id,
                plate_number: plateTrimmed,
                vehicle_type: vehicleType,
                make: vehicleMake.trim() || null,
                model: vehicleModel.trim() || null,
                color: vehicleColor.trim() || null,
                is_primary: vehiclePrimary,
              });
              toast({ title: "Vehicle added" });
            } catch (vErr) {
              toast({
                title: "Resident saved, vehicle failed",
                description:
                  vErr instanceof Error
                    ? vErr.message
                    : "Could not save vehicle — add it later from /admin/vehicles",
                variant: "destructive",
              });
            }
          }
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Could not save resident",
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
          <DialogTitle>{initial?.id ? "Edit Resident" : "Add Resident"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Flat *</Label>
            <Select value={flat_id} onValueChange={setFlatId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a flat" />
              </SelectTrigger>
              <SelectContent>
                {flatOptions.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.flat_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Full name *</Label>
            <Input required value={full_name} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03001234567" />
          </div>
          <div>
            <Label>CNIC</Label>
            <Input value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="42101-1234567-1" />
          </div>
          <div className="col-span-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Relationship</Label>
            <Select
              value={relationship}
              onValueChange={(v) => setRelationship(v as "owner" | "tenant")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="tenant">Tenant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Move-in date</Label>
            <Input type="date" value={move_in_date} onChange={(e) => setMoveIn(e.target.value)} />
          </div>
          <div>
            <Label>Move-out date</Label>
            <Input type="date" value={move_out_date} onChange={(e) => setMoveOut(e.target.value)} />
          </div>
          <div>
            <Label>Entry fee paid (PKR)</Label>
            <Input
              type="number"
              value={entry_fee_paid}
              onChange={(e) => {
                setEntryFee(e.target.value);
                setEntryFeePaidTouched(true);
              }}
            />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={is_primary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="h-4 w-4"
              />
              Mark as primary resident
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={is_active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4"
              />
              Active
            </label>
          </div>
          {!isEdit && (
            <div className="col-span-2 border-t border-border pt-4 mt-1 space-y-3">
              <div>
                <h4 className="text-sm font-semibold">Vehicle (optional)</h4>
                <p className="text-xs text-muted-foreground">
                  Add one now. More can be registered later from the Vehicles page.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Number plate</Label>
                  <Input
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    placeholder="ALN-540"
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select
                    value={vehicleType}
                    onValueChange={(v) => setVehicleType(v as VehicleType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="car">Car</SelectItem>
                      <SelectItem value="bike">Bike</SelectItem>
                      <SelectItem value="ev">EV</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Make</Label>
                  <Input
                    value={vehicleMake}
                    onChange={(e) => setVehicleMake(e.target.value)}
                    placeholder="Toyota"
                  />
                </div>
                <div>
                  <Label>Model</Label>
                  <Input
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    placeholder="Corolla GLi"
                  />
                </div>
                <div>
                  <Label>Color</Label>
                  <Input
                    value={vehicleColor}
                    onChange={(e) => setVehicleColor(e.target.value)}
                    placeholder="white"
                  />
                </div>
                <label className="flex items-end gap-2 text-sm pb-2">
                  <input
                    type="checkbox"
                    checked={vehiclePrimary}
                    onChange={(e) => setVehiclePrimary(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Primary vehicle for this flat
                </label>
              </div>
            </div>
          )}
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
              {pending ? "Saving..." : initial?.id ? "Save changes" : "Add resident"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
