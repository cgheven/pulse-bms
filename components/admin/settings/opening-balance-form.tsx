"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { formatCurrency, formatDate } from "@/lib/utils";
import { updateOpeningBalance } from "@/app/actions/buildings";

export function OpeningBalanceForm({
  initialAmount,
  initialDate,
  transactionCount,
}: {
  initialAmount: number;
  initialDate: string;
  transactionCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState<number>(initialAmount);
  const [date, setDate] = useState<string>(initialDate);
  const [error, setError] = useState<string | null>(null);

  // Whether the form values differ from what's currently saved. We use
  // this both to enable/disable the save button and to gate the dirty
  // warning so admins don't see the banner just for opening the page.
  const dirty =
    Number(amount) !== Number(initialAmount) || date !== initialDate;

  const today = new Date().toISOString().slice(0, 10);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation mirrors the server action so the user gets
    // immediate feedback. Server still enforces the same rules.
    if (!Number.isFinite(Number(amount)) || Number(amount) < 0) {
      setError("Amount must be zero or a positive number.");
      return;
    }
    if (!date) {
      setError("Pick an as-of date.");
      return;
    }
    if (date > today) {
      setError("As-of date cannot be in the future.");
      return;
    }

    start(async () => {
      try {
        await updateOpeningBalance({ amount: Number(amount), date });
        toast({ title: "Opening Fund Balance saved" });
        router.refresh();
      } catch (err) {
        const msg = friendlyErrorMessage(err, "Could not save Opening Fund Balance");
        setError(msg);
        toast({
          title: "Could not save",
          description: msg,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Current state — small summary so admins see what's saved before
          editing. Same source of truth as the Reports module. */}
      <div className="card-soft">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
            <Wallet className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Currently saved</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatCurrency(initialAmount)}
            </p>
            <p className="text-sm text-muted-foreground">
              As of {formatDate(initialDate)}
            </p>
          </div>
        </div>
      </div>

      {transactionCount > 0 && dirty && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 p-4">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">
              You have {transactionCount} transaction
              {transactionCount === 1 ? "" : "s"} recorded on or after this date.
            </p>
            <p>
              Changing the Opening Fund Balance will shift every historical
              running balance. Proceed only if correcting onboarding data.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="card-soft space-y-5 max-w-xl">
        <div className="space-y-2">
          <Label htmlFor="amount" className="text-base">
            Amount (Rs.)
          </Label>
          <Input
            id="amount"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            className="h-12 text-base"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            placeholder="250000"
          />
          <p className="text-xs text-muted-foreground">
            Total cash on hand plus money in every bank account on the
            as-of date.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="date" className="text-base">
            As-of date
          </Label>
          <Input
            id="date"
            type="date"
            max={today}
            className="h-12 text-base"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The day you started using Pulse. Reports treat money before
            this date as your Opening Fund Balance.
          </p>
        </div>

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={pending || !dirty}
            className="btn-big"
          >
            {pending ? "Saving..." : "Save Opening Fund Balance"}
          </Button>
        </div>
      </form>
    </div>
  );
}
