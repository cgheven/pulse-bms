"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  createProposal,
  type ProposalType,
  type VotingRule,
} from "@/app/actions/proposals";

type Props = {
  proposal_type: ProposalType;
  defaultTitle?: string;
  buttonLabel: string;
  dialogTitle: string;
  dialogDescription?: string;
  showAmount?: boolean;
  defaultVotingRule?: VotingRule;
  variant?: "default" | "outline" | "secondary";
  className?: string;
};

export function ProposeButton({
  proposal_type,
  defaultTitle = "",
  buttonLabel,
  dialogTitle,
  dialogDescription,
  showAmount = false,
  defaultVotingRule,
  variant = "default",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [votingRule, setVotingRule] = useState<VotingRule>(
    defaultVotingRule ?? "majority"
  );
  const [pending, startTransition] = useTransition();

  function reset() {
    setTitle(defaultTitle);
    setDescription("");
    setAmount("");
  }

  function submit() {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    const parsedAmount = showAmount && amount ? Number(amount) : undefined;
    if (showAmount && amount && Number.isNaN(parsedAmount)) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      try {
        await createProposal({
          title: title.trim(),
          description: description.trim() || undefined,
          proposal_type,
          amount: parsedAmount,
          voting_rule: votingRule,
        });
        toast({ title: "Proposal raised", description: "Union members can now vote." });
        setOpen(false);
        reset();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to create proposal";
        toast({ title: "Could not create proposal", description: msg, variant: "destructive" });
      }
    });
  }

  return (
    <>
      <Button
        variant={variant}
        onClick={() => setOpen(true)}
        className={className ?? "btn-big bg-primary text-primary-foreground hover:bg-primary/90"}
      >
        <Plus className="w-5 h-5" />
        {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!pending) setOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            {dialogDescription && (
              <DialogDescription>{dialogDescription}</DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prop-title">Title</Label>
              <Input
                id="prop-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Replace lift motor in Block A"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prop-desc">Details</Label>
              <Textarea
                id="prop-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Background, quotes, vendor, urgency…"
                rows={4}
              />
            </div>

            {showAmount && (
              <div className="space-y-2">
                <Label htmlFor="prop-amount">Amount (PKR)</Label>
                <Input
                  id="prop-amount"
                  type="number"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="h-11"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="prop-rule">Voting rule</Label>
              <Select value={votingRule} onValueChange={(v) => setVotingRule(v as VotingRule)}>
                <SelectTrigger id="prop-rule" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="majority">Majority — more than half approve</SelectItem>
                  <SelectItem value="unanimous">Unanimous — all must approve</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                </>
              ) : (
                "Raise proposal"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
