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
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
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
};

const DEFAULTS: BuildingFormValues = {
  name: "",
  address: "",
  city: "Karachi",
  total_flats: 0,
};

export function BuildingFormDialog({
  mode,
  initial,
  trigger,
  open: openProp,
  onOpenChange,
  admins = [],
}: {
  mode: Mode;
  initial?: Partial<BuildingFormValues>;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  admins?: { id: string; label: string }[];
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
  const [adminId, setAdminId] = useState<string>("");
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
      // Opening balance is owned by the building's Admin (President),
      // not Super Admin. New buildings start at 0 / today; Admin sets
      // the real number from Settings → Opening Balance after creation.
      opening_balance_amount: null,
      opening_balance_date: null,
    };

    startTransition(async () => {
      try {
        if (mode === "create") {
          await createBuilding({ ...payload, admin_id: adminId || null });
          toast({ title: "Building created" });
          setValues({ ...DEFAULTS });
          setAdminId("");
        } else if (initial?.id) {
          await updateBuilding(initial.id, payload);
          toast({ title: "Building updated" });
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not save",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger}
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add New Building" : "Edit Building"}
          </DialogTitle>
          <DialogDescription>
            Set the building shell. Fees, voting rule and utility cut-off are
            managed by the building&rsquo;s Union from their settings page.
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

          {mode === "create" && admins.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="admin_id" className="text-base">
                Assign Admin <span className="text-muted-foreground text-sm font-normal">(optional)</span>
              </Label>
              <select
                id="admin_id"
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">— No admin yet —</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                You can also assign or change the admin later from the Admins page.
              </p>
            </div>
          )}

          {mode === "create" && (
            <p className="text-xs text-muted-foreground">
              The Opening Fund Balance is set by the building&rsquo;s Admin
              (President) from Settings → Opening Fund Balance after onboarding.
            </p>
          )}

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
