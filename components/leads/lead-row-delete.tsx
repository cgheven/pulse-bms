"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { deleteLead } from "@/app/actions/leads";

/**
 * Inline trash button rendered in each row of the Leads list table.
 * Opens a confirm dialog, then hard-deletes the lead via the
 * `deleteLead` server action. Refreshes the list on success so the
 * deleted row disappears without a full reload.
 */
export function LeadRowDelete({
  leadId,
  buildingName,
}: {
  leadId: string;
  buildingName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function performDelete() {
    startTransition(async () => {
      try {
        await deleteLead(leadId);
        toast({ title: "Lead deleted" });
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not delete lead",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${buildingName}`}
        title="Delete lead"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
      <ConfirmDialog
        open={open}
        title={`Delete ${buildingName}?`}
        description="This permanently removes the lead and all its activity history. The deletion is recorded in the audit log."
        confirmLabel={pending ? "Deleting..." : "Delete lead"}
        loading={pending}
        onCancel={() => setOpen(false)}
        onConfirm={performDelete}
      />
    </>
  );
}
