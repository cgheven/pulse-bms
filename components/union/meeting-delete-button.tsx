"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";
import { deleteMeeting } from "@/app/actions/meetings";
import { friendlyErrorMessage } from "@/lib/toast-error";

export function MeetingDeleteButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  function run() {
    startTransition(async () => {
      try {
        await deleteMeeting(id);
        toast({ title: "Meeting deleted" });
        setOpen(false);
      } catch (e) {
        const msg = friendlyErrorMessage(e, "Failed to delete meeting");
        toast({ title: "Could not delete", description: msg, variant: "destructive" });
      }
    });
  }
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} disabled={pending} aria-label="Delete meeting">
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete this meeting?"
        description="This will remove the meeting and any minutes attached."
        confirmLabel="Delete"
        onConfirm={run}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
