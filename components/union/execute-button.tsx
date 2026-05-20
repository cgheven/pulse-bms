"use client";

import { useState, useTransition } from "react";
import { Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";
import { executeProposal } from "@/app/actions/proposals";
import { friendlyErrorMessage } from "@/lib/toast-error";

export function ExecuteButton({ proposalId }: { proposalId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        await executeProposal(proposalId);
        toast({
          title: "Proposal executed",
          description: "If this was an expense, it has been booked.",
        });
        setOpen(false);
      } catch (e) {
        const msg = friendlyErrorMessage(e, "Failed to execute proposal");
        toast({ title: "Execution failed", description: msg, variant: "destructive" });
      }
    });
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={pending}
        className="btn-big bg-blue-600 text-white hover:bg-blue-700"
      >
        {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Rocket className="w-5 h-5" />}
        Execute proposal
      </Button>
      <ConfirmDialog
        open={open}
        title="Execute this proposal?"
        description="If this is an expense, a matching expense entry will be created and linked. This cannot be undone."
        confirmLabel="Execute"
        onConfirm={run}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
