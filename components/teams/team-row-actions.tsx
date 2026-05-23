"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power, PowerOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  deactivateTeamMember,
  reactivateTeamMember,
  deleteTeamMember,
} from "@/app/actions/teams";

export function TeamRowActions({
  member,
}: {
  member: {
    id: string;
    email: string | null;
    full_name: string | null;
    is_active: boolean;
  };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [toggleOpen, setToggleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

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
