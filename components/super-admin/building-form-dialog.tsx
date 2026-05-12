"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  createBuilding,
  updateBuilding,
  type BuildingInput,
} from "@/app/actions/super-admin";

type Mode = "create" | "edit";

export type BuildingFormValues = {
  id?: string;
  name: string;
  address: string | null;
  city: string | null;
  total_flats: number;
  entry_fee_owner: number;
  entry_fee_tenant: number;
  monthly_fee_default: number;
  voting_rule: "majority" | "unanimous";
  utility_cutoff_after_months: number;
};

const DEFAULTS: BuildingFormValues = {
  name: "",
  address: "",
  city: "Karachi",
  total_flats: 0,
  entry_fee_owner: 10000,
  entry_fee_tenant: 5000,
  monthly_fee_default: 3000,
  voting_rule: "majority",
  utility_cutoff_after_months: 3,
};

export function BuildingFormDialog({
  mode,
  initial,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  mode: Mode;
  initial?: Partial<BuildingFormValues>;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (o: boolean) => {
    if (onOpenChange) onOpenChange(o);
    else setInternalOpen(o);
  };

  const [values, setValues] = useState<BuildingFormValues>({
    ...DEFAULTS,
    ...initial,
  });
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof BuildingFormValues>(k: K, v: BuildingFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();

    if (!values.name.trim()) {
      toast({ title: "Building name is required", variant: "destructive" });
      return;
    }

    const payload: BuildingInput = {
      name: values.name,
      address: values.address,
      city: values.city,
      total_flats: Number(values.total_flats) || 0,
      entry_fee_owner: Number(values.entry_fee_owner) || 0,
      entry_fee_tenant: Number(values.entry_fee_tenant) || 0,
      monthly_fee_default: Number(values.monthly_fee_default) || 0,
      voting_rule: values.voting_rule,
      utility_cutoff_after_months: Number(values.utility_cutoff_after_months) || 0,
    };

    startTransition(async () => {
      try {
        if (mode === "create") {
          await createBuilding(payload);
          toast({ title: "Building created" });
          setValues({ ...DEFAULTS });
        } else if (initial?.id) {
          await updateBuilding(initial.id, payload);
          toast({ title: "Building updated" });
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not save",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger}
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add New Building" : "Edit Building"}
          </DialogTitle>
          <DialogDescription>
            Set the building details and default fees. You can change these later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-base">
              Building Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              className="h-12 text-base"
              placeholder="e.g. Al-Madina Heights"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city" className="text-base">City</Label>
              <Input
                id="city"
                className="h-12 text-base"
                value={values.city ?? ""}
                onChange={(e) => set("city", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_flats" className="text-base">Total Flats</Label>
              <Input
                id="total_flats"
                type="number"
                min={0}
                className="h-12 text-base"
                value={values.total_flats}
                onChange={(e) => set("total_flats", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address" className="text-base">Address</Label>
            <Input
              id="address"
              className="h-12 text-base"
              placeholder="Street / area / block"
              value={values.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entry_fee_owner" className="text-base">
                Entry Fee (Owner)
              </Label>
              <Input
                id="entry_fee_owner"
                type="number"
                min={0}
                className="h-12 text-base"
                value={values.entry_fee_owner}
                onChange={(e) => set("entry_fee_owner", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry_fee_tenant" className="text-base">
                Entry Fee (Tenant)
              </Label>
              <Input
                id="entry_fee_tenant"
                type="number"
                min={0}
                className="h-12 text-base"
                value={values.entry_fee_tenant}
                onChange={(e) => set("entry_fee_tenant", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly_fee_default" className="text-base">
                Monthly Fee (Default)
              </Label>
              <Input
                id="monthly_fee_default"
                type="number"
                min={0}
                className="h-12 text-base"
                value={values.monthly_fee_default}
                onChange={(e) => set("monthly_fee_default", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-base">Voting Rule</Label>
              <Select
                value={values.voting_rule}
                onValueChange={(v) => set("voting_rule", v as "majority" | "unanimous")}
              >
                <SelectTrigger className="h-12 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="majority">Majority (more than half)</SelectItem>
                  <SelectItem value="unanimous">Unanimous (everyone agrees)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cutoff" className="text-base">
                Utility Cutoff (months unpaid)
              </Label>
              <Input
                id="cutoff"
                type="number"
                min={1}
                className="h-12 text-base"
                value={values.utility_cutoff_after_months}
                onChange={(e) =>
                  set("utility_cutoff_after_months", Number(e.target.value))
                }
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="h-12 px-6 text-base"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="btn-big">
              {isPending
                ? "Saving..."
                : mode === "create"
                ? "Create Building"
                : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
