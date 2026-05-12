"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power, PowerOff, MoveRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { reassignAdmin, setAdminActive } from "@/app/actions/super-admin";

type BuildingOption = { id: string; name: string };

export function AdminRowActions({
  admin,
  buildings,
}: {
  admin: {
    id: string;
    email: string | null;
    full_name: string | null;
    building_id: string | null;
    is_active: boolean;
  };
  buildings: BuildingOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [target, setTarget] = useState<string>(admin.building_id ?? "");
  const [isPending, startTransition] = useTransition();

  function submitReassign() {
    if (!target) {
      toast({ title: "Choose a building", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      try {
        await reassignAdmin(admin.id, target);
        toast({ title: "Admin reassigned" });
        setReassignOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not reassign",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  function toggleActive() {
    startTransition(async () => {
      try {
        await setAdminActive(admin.id, !admin.is_active);
        toast({ title: admin.is_active ? "Admin deactivated" : "Admin re-activated" });
        setConfirmOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not update",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-9"
        onClick={() => setReassignOpen(true)}
      >
        <MoveRight className="w-4 h-4" />
        Reassign
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 text-destructive hover:text-destructive"
        onClick={() => setConfirmOpen(true)}
      >
        {admin.is_active ? (
          <>
            <PowerOff className="w-4 h-4" />
            Deactivate
          </>
        ) : (
          <>
            <Power className="w-4 h-4" />
            Activate
          </>
        )}
      </Button>

      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign Admin</DialogTitle>
            <DialogDescription>
              Move {admin.full_name || admin.email} to a different building.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-base">New Building</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Choose a building" />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={() => setReassignOpen(false)}
              disabled={isPending}
              className="h-12 px-6 text-base"
            >
              Cancel
            </Button>
            <Button onClick={submitReassign} disabled={isPending} className="btn-big">
              {isPending ? "Saving..." : "Reassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title={admin.is_active ? "Deactivate admin?" : "Re-activate admin?"}
        description={
          admin.is_active
            ? "They will not be able to sign in until you re-activate."
            : "They will regain access to their assigned building."
        }
        confirmLabel={
          isPending ? "Working..." : admin.is_active ? "Deactivate" : "Activate"
        }
        onConfirm={toggleActive}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
