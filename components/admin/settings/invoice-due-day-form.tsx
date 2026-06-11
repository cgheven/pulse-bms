"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { updateInvoiceDueDay } from "@/app/actions/billing";

export function InvoiceDueDayForm({ initial }: { initial: number }) {
  const [day, setDay] = useState(initial);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const dirty = day !== initial;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        await updateInvoiceDueDay(day);
        toast({ title: "Due day saved" });
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not save",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <form onSubmit={submit} className="card-soft space-y-4">
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="invoice_due_day" className="text-sm font-medium">
          Invoice Due Day
        </Label>
        <Input
          id="invoice_due_day"
          type="number"
          min={1}
          max={28}
          className="h-11 text-base"
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground leading-snug">
          Day of the billing month by which residents must pay (1–28). Applied
          to every new invoice generated for this building.
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={!dirty || pending} className="btn-big">
          <Save className="w-4 h-4" />
          {pending ? "Saving..." : "Save"}
        </Button>
        {dirty && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setDay(initial)}
            disabled={pending}
          >
            Reset
          </Button>
        )}
      </div>
    </form>
  );
}
