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
import { inviteAdmin } from "@/app/actions/super-admin";

type BuildingOption = { id: string; name: string };

export function AdminInviteButton({ buildings }: { buildings: BuildingOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="btn-big" onClick={() => setOpen(true)}>
        + Invite Admin
      </Button>
      <AdminInviteDialog
        buildings={buildings}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function AdminInviteDialog({
  buildings,
  open,
  onOpenChange,
}: {
  buildings: BuildingOption[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [buildingId, setBuildingId] = useState<string>(buildings[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: "Email is required", variant: "destructive" });
      return;
    }
    if (!buildingId) {
      toast({ title: "Please select a building", variant: "destructive" });
      return;
    }

    startTransition(async () => {
      try {
        const res = await inviteAdmin({
          email,
          full_name: fullName,
          phone,
          building_id: buildingId,
        });
        toast({
          title: res.invited
            ? "Invitation email sent"
            : "Existing user assigned as admin",
        });
        setEmail("");
        setFullName("");
        setPhone("");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not invite admin",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite New Admin</DialogTitle>
          <DialogDescription>
            We will email an invite link. After they sign in, they will be made the admin for the selected building.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-base">
              Email Address <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              required
              placeholder="admin@example.com"
              className="h-12 text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-base">Full Name</Label>
              <Input
                id="full_name"
                className="h-12 text-base"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-base">Phone</Label>
              <Input
                id="phone"
                className="h-12 text-base"
                placeholder="0300-1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-base">
              Assign to Building <span className="text-destructive">*</span>
            </Label>
            <Select value={buildingId} onValueChange={setBuildingId}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Choose a building" />
              </SelectTrigger>
              <SelectContent>
                {buildings.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">
                    No buildings yet — add one first.
                  </div>
                )}
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
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="h-12 px-6 text-base"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="btn-big">
              {isPending ? "Sending..." : "Send Invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
