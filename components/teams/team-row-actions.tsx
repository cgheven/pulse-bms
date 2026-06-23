"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  deactivateTeamMember,
  reactivateTeamMember,
  deleteTeamMember,
  updateTeamMember,
} from "@/app/actions/teams";

type Member = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
};

export function TeamRowActions({ member }: { member: Member }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Edit form state
  const [fullName, setFullName] = useState(member.full_name ?? "");
  const [email, setEmail] = useState(member.email ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");

  function openEdit() {
    setFullName(member.full_name ?? "");
    setEmail(member.email ?? "");
    setPhone(member.phone ?? "");
    setEditOpen(true);
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateTeamMember({
          profileId: member.id,
          full_name: fullName,
          email,
          phone,
        });
        toast({ title: "Team member updated" });
        setEditOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not update",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  function toggleActive() {
    startTransition(async () => {
      try {
        if (member.is_active) {
          await deactivateTeamMember(member.id);
          toast({ title: "Team member deactivated" });
        } else {
          await reactivateTeamMember(member.id);
          toast({ title: "Team member re-activated" });
        }
        setToggleOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not update",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  function performDelete() {
    startTransition(async () => {
      try {
        await deleteTeamMember(member.id);
        toast({ title: "Team member deleted" });
        setDeleteOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not delete",
          description: friendlyErrorMessage(err),
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
        onClick={openEdit}
      >
        <Pencil className="w-4 h-4" />
        Edit
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-9"
        onClick={() => setToggleOpen(true)}
      >
        {member.is_active ? (
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

      <Button
        variant="ghost"
        size="sm"
        className="h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => setDeleteOpen(true)}
        title="Delete this team member permanently"
      >
        <Trash2 className="w-4 h-4" />
        Delete
      </Button>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
            <DialogDescription>
              Update their name, email address, or mobile number.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-base">Full Name</Label>
              <Input
                id="edit-name"
                required
                className="h-12 text-base"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email" className="text-base">Email</Label>
              <Input
                id="edit-email"
                type="email"
                className="h-12 text-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Leave blank to keep current"
              />
              <p className="text-xs text-muted-foreground">
                This is the address they use to sign in.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone" className="text-base">Mobile Number</Label>
              <Input
                id="edit-phone"
                type="tel"
                className="h-12 text-base"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0333-1231231"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={isPending}
                className="h-12 px-6 text-base"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="btn-big">
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toggleOpen}
        title={member.is_active ? "Deactivate team member?" : "Re-activate team member?"}
        description={
          member.is_active
            ? "They will not be able to sign in until you re-activate."
            : "They will regain access to the Leads CRM."
        }
        confirmLabel={
          isPending ? "Working..." : member.is_active ? "Deactivate" : "Activate"
        }
        onConfirm={toggleActive}
        onCancel={() => setToggleOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={`Permanently delete ${member.full_name || member.email}?`}
        description="This removes their login and account entirely. The audit log will retain a record of this deletion."
        confirmLabel={isPending ? "Deleting..." : "Delete user"}
        onConfirm={performDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
