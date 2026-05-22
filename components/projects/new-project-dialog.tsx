"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Coins, CalendarDays, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { createProject, type ContributionRule } from "@/app/actions/projects";
import { formatCurrency, cn } from "@/lib/utils";

type ProposalOption = { id: string; title: string };

/**
 * 3-step wizard for creating a Project Fund.
 *
 * Steps:
 *   1. Basics — name + description + optional proposal link
 *   2. Target — target amount + contribution rule
 *   3. Schedule — start/end dates + review
 *
 * We keep this purely client-side state (no URL persistence) — the form
 * is short and the wizard closes after creation, so back-button drama
 * isn't worth the complexity.
 */
export function NewProjectDialog({
  totalFlats,
  proposals,
  trigger,
}: {
  /** Used to suggest a default per-flat amount in step 2. */
  totalFlats: number;
  proposals: ProposalOption[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [proposalId, setProposalId] = useState<string>("");

  // Step 2
  const [targetAmount, setTargetAmount] = useState<string>("");
  const [rule, setRule] = useState<ContributionRule>("equal");
  const [defaultPerFlat, setDefaultPerFlat] = useState<string>("");

  // Step 3
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState<string>("");

  // Auto-suggest per-flat when target/rule change
  const suggestedPerFlat = useMemo(() => {
    const t = Number(targetAmount);
    if (!t || !totalFlats) return null;
    return Math.ceil(t / totalFlats);
  }, [targetAmount, totalFlats]);

  function reset() {
    setStep(1);
    setName("");
    setDescription("");
    setProposalId("");
    setTargetAmount("");
    setRule("equal");
    setDefaultPerFlat("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
  }

  const canGoStep2 = name.trim().length > 0;
  const canGoStep3 = (() => {
    if (rule === "voluntary") return true;
    const t = Number(targetAmount);
    if (!t || t <= 0) return false;
    if (rule === "equal") {
      const d = Number(defaultPerFlat);
      return !!d && d > 0;
    }
    return true;
  })();
  const canSubmit = canGoStep2 && canGoStep3 && !!startDate;

  function onSubmit() {
    start(async () => {
      try {
        await createProject({
          name: name.trim(),
          description: description.trim() || null,
          target_amount:
            rule === "voluntary" || !targetAmount ? null : Number(targetAmount),
          contribution_rule: rule,
          default_per_flat:
            rule === "equal" ? Number(defaultPerFlat) : null,
          start_date: startDate,
          end_date: endDate || null,
          proposal_id: proposalId || null,
        });
        toast({
          title: "Project created",
          description:
            rule === "equal"
              ? "Per-flat shares set up automatically."
              : rule === "custom"
              ? "Now set each flat's share from the contributors tab."
              : "Voluntary — residents can contribute any amount.",
        });
        setOpen(false);
        reset();
        router.refresh();
      } catch (err) {
        toast({
          title: "Couldn't create project",
          description: friendlyErrorMessage(err, "Try again in a moment."),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start a new project fund</DialogTitle>
        </DialogHeader>

        <StepIndicator step={step} />

        <div className="mt-4">
          {step === 1 && (
            <div className="space-y-4 animate-fade-up">
              <div>
                <Label>Project name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Solar installation, Lift overhaul…"
                  autoFocus
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is the money for? Keep it short and clear."
                />
              </div>
              <div>
                <Label>Link to proposal (optional)</Label>
                <Select
                  value={proposalId || "none"}
                  onValueChange={(v) => setProposalId(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Skip" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No proposal</SelectItem>
                    {proposals.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Use this to tie collections back to a committee decision.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-up">
              <div>
                <Label>Target amount (PKR){rule !== "voluntary" && " *"}</Label>
                <Input
                  type="number"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  placeholder={rule === "voluntary" ? "Leave blank — any amount welcome" : "e.g. 800000"}
                />
                {rule === "voluntary" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Voluntary projects don&apos;t need a target.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Contribution rule *</Label>
                <RuleRadio
                  active={rule === "equal"}
                  onClick={() => setRule("equal")}
                  title="Equal split"
                  description={
                    totalFlats > 0
                      ? `Each of the ${totalFlats} flats pays the same share.`
                      : "Each flat pays the same share."
                  }
                />
                <RuleRadio
                  active={rule === "custom"}
                  onClick={() => setRule("custom")}
                  title="Custom shares"
                  description="Set each flat's share manually — ground-floor shops can pay more."
                />
                <RuleRadio
                  active={rule === "voluntary"}
                  onClick={() => setRule("voluntary")}
                  title="Voluntary"
                  description="Any amount welcome. No per-flat target, no defaulters."
                />
              </div>

              {rule === "equal" && (
                <div>
                  <Label>Each flat pays (PKR) *</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={defaultPerFlat}
                      onChange={(e) => setDefaultPerFlat(e.target.value)}
                      placeholder={suggestedPerFlat ? String(suggestedPerFlat) : "Enter amount"}
                    />
                    {suggestedPerFlat && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDefaultPerFlat(String(suggestedPerFlat))}
                      >
                        Use {formatCurrency(suggestedPerFlat)}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Suggestion: target ÷ {totalFlats || "?"} flats = {suggestedPerFlat ? formatCurrency(suggestedPerFlat) : "—"}
                  </p>
                </div>
              )}

              {rule === "custom" && (
                <div className="rounded-lg border border-dashed border-border bg-secondary/40 p-3 text-sm">
                  <p className="font-medium">After creating the project</p>
                  <p className="text-muted-foreground mt-1">
                    You&apos;ll see every flat in the Contributors tab. Tap any
                    row to set that flat&apos;s expected amount.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-fade-up">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start date *</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Deadline (optional)</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-2 text-sm">
                <h4 className="font-semibold mb-2">Review</h4>
                <ReviewRow label="Project name" value={name || "—"} />
                <ReviewRow
                  label="Target"
                  value={
                    rule === "voluntary"
                      ? "Open-ended"
                      : targetAmount
                      ? formatCurrency(Number(targetAmount))
                      : "—"
                  }
                />
                <ReviewRow
                  label="Rule"
                  value={
                    rule === "equal"
                      ? `Equal — ${defaultPerFlat ? formatCurrency(Number(defaultPerFlat)) : "?"}/flat`
                      : rule === "custom"
                      ? "Custom shares"
                      : "Voluntary"
                  }
                />
                <ReviewRow
                  label="When"
                  value={
                    endDate
                      ? `${startDate} → ${endDate}`
                      : `From ${startDate} (no deadline)`
                  }
                />
                {proposalId && (
                  <ReviewRow
                    label="Proposal"
                    value={
                      proposals.find((p) => p.id === proposalId)?.title ?? "—"
                    }
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between mt-4 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (step === 1) setOpen(false);
              else setStep((s) => (s - 1) as 1 | 2 | 3);
            }}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>

          {step < 3 ? (
            <Button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              disabled={
                (step === 1 && !canGoStep2) || (step === 2 && !canGoStep3)
              }
            >
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit || pending}
              className="btn-big"
            >
              {pending ? "Creating…" : "Create project"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Basics", icon: Sparkles },
    { n: 2, label: "Target", icon: Coins },
    { n: 3, label: "Schedule", icon: CalendarDays },
  ];
  return (
    <div className="flex items-center justify-between gap-2 px-1 pt-1">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const done = step > s.n;
        const active = step === s.n;
        return (
          <div key={s.n} className="flex items-center gap-2 flex-1">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold shrink-0 transition-all",
                done && "bg-primary text-primary-foreground border-primary",
                active &&
                  "border-primary text-primary bg-primary/10 ring-2 ring-primary/30",
                !done && !active && "border-border text-muted-foreground bg-background",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </div>
            <span
              className={cn(
                "text-xs font-medium uppercase tracking-wider hidden sm:inline",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-px transition-colors",
                  step > s.n ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RuleRadio({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-all",
        active
          ? "border-primary bg-primary/10 ring-2 ring-primary/20"
          : "border-border hover:border-primary/40 hover:bg-secondary/40",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border shrink-0 transition-colors",
            active ? "border-primary bg-primary" : "border-muted-foreground/40",
          )}
        >
          {active && <span className="block h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
        </div>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
