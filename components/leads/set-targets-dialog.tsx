"use client";

import { useState, useTransition } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { updateSalesTargets, type SalesTargets } from "@/app/actions/sales-targets";

export function SetTargetsButton({ current }: { current: SalesTargets }) {
  const [open, setOpen] = useState(false);
  const [daily, setDaily] = useState(String(current.daily_target ?? ""));
  const [weekly, setWeekly] = useState(String(current.weekly_target ?? ""));
  const [monthly, setMonthly] = useState(String(current.monthly_target ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function handleOpen() {
    setDaily(String(current.daily_target ?? ""));
    setWeekly(String(current.weekly_target ?? ""));
    setMonthly(String(current.monthly_target ?? ""));
    setError(null);
    setOpen(true);
  }

  function handleSave() {
    setError(null);
    const d = daily ? parseInt(daily, 10) : null;
    const w = weekly ? parseInt(weekly, 10) : null;
    const m = monthly ? parseInt(monthly, 10) : null;
    if ((d !== null && (isNaN(d) || d < 1)) ||
        (w !== null && (isNaN(w) || w < 1)) ||
        (m !== null && (isNaN(m) || m < 1))) {
      setError("Targets must be positive whole numbers.");
      return;
    }
    start(async () => {
      try {
        await updateSalesTargets({ daily_target: d, weekly_target: w, monthly_target: m });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save targets.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Settings className="w-3.5 h-3.5" />
        Set Targets
      </button>

      <Dialog open={open} onOpenChange={(v) => !v && !isPending && setOpen(false)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Visit Targets</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Set how many new leads the team should add per period. Leave blank to remove a target.
            </p>
            {[
              { label: "Daily target", value: daily, set: setDaily, id: "t-daily" },
              { label: "Weekly target", value: weekly, set: setWeekly, id: "t-weekly" },
              { label: "Monthly target", value: monthly, set: setMonthly, id: "t-monthly" },
            ].map(({ label, value, set, id }) => (
              <div key={id} className="space-y-1.5">
                <Label htmlFor={id} className="text-sm">{label}</Label>
                <Input
                  id={id}
                  type="number"
                  min={1}
                  placeholder="e.g. 5"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="h-11"
                />
              </div>
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending} className="h-11">
              {isPending ? "Saving…" : "Save Targets"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
