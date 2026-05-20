"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, MinusCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { castVote, type VoteChoice } from "@/app/actions/proposals";
import { friendlyErrorMessage } from "@/lib/toast-error";

type Props = {
  proposalId: string;
  existingVote: VoteChoice | null;
  canVote: boolean;
  proposalStatus: string;
};

const CHOICE_LABEL: Record<VoteChoice, string> = {
  approve: "APPROVE",
  reject: "REJECT",
  abstain: "ABSTAIN",
};

export function VotePanel({ proposalId, existingVote, canVote, proposalStatus }: Props) {
  const [choice, setChoice] = useState<VoteChoice | null>(null);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  if (existingVote) {
    return (
      <div className="card-soft border-2 border-primary/20 bg-primary/5">
        <h3 className="text-xl font-bold mb-2">Your vote: {CHOICE_LABEL[existingVote]} (locked)</h3>
        <p className="text-muted-foreground">
          Votes cannot be changed after submission. Each union member votes once per proposal.
        </p>
      </div>
    );
  }

  if (!canVote) {
    return (
      <div className="card-soft bg-secondary">
        <p className="text-muted-foreground">
          {proposalStatus === "pending"
            ? "Only active union members can vote on proposals."
            : "Voting is closed — this proposal has been finalized."}
        </p>
      </div>
    );
  }

  if (proposalStatus !== "pending") {
    return (
      <div className="card-soft bg-secondary">
        <p className="text-muted-foreground">Voting is closed — this proposal has been finalized.</p>
      </div>
    );
  }

  function submit() {
    if (!choice) {
      toast({ title: "Pick your vote first", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      try {
        await castVote(proposalId, choice, comment.trim() || undefined);
        toast({ title: "Vote recorded", description: `You voted to ${choice}.` });
      } catch (e) {
        const msg = friendlyErrorMessage(e, "Failed to cast vote");
        toast({ title: "Could not vote", description: msg, variant: "destructive" });
      }
    });
  }

  return (
    <div className="card-soft">
      <h3 className="text-2xl font-bold mb-1">Cast your vote</h3>
      <p className="text-muted-foreground mb-5">
        Your vote is final once submitted. Please review the proposal before voting.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <button
          type="button"
          onClick={() => setChoice("approve")}
          disabled={pending}
          className={cn(
            "btn-big flex items-center justify-center gap-2 border-2",
            choice === "approve"
              ? "bg-green-600 text-white border-green-700"
              : "bg-white text-green-700 border-green-300 hover:bg-green-50"
          )}
        >
          <CheckCircle2 className="w-6 h-6" />
          Approve
        </button>

        <button
          type="button"
          onClick={() => setChoice("reject")}
          disabled={pending}
          className={cn(
            "btn-big flex items-center justify-center gap-2 border-2",
            choice === "reject"
              ? "bg-red-600 text-white border-red-700"
              : "bg-white text-red-700 border-red-300 hover:bg-red-50"
          )}
        >
          <XCircle className="w-6 h-6" />
          Reject
        </button>

        <button
          type="button"
          onClick={() => setChoice("abstain")}
          disabled={pending}
          className={cn(
            "btn-big flex items-center justify-center gap-2 border-2",
            choice === "abstain"
              ? "bg-gray-600 text-white border-gray-700"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
          )}
        >
          <MinusCircle className="w-6 h-6" />
          Abstain
        </button>
      </div>

      <div className="space-y-2 mb-4">
        <Label htmlFor="vote-comment">Add a comment (optional)</Label>
        <Textarea
          id="vote-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Why are you voting this way?"
          rows={3}
        />
      </div>

      <Button
        onClick={submit}
        disabled={pending || !choice}
        className="btn-big bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto"
      >
        {pending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" /> Submitting…
          </>
        ) : (
          "Submit vote"
        )}
      </Button>
    </div>
  );
}
