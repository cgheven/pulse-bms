"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { generateMonthlyInvoices } from "@/app/actions/billing";

export function GenerateInvoicesButton({ defaultMonth }: { defaultMonth: string }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(defaultMonth);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const onGo = () => {
    start(async () => {
      try {
        const res = await generateMonthlyInvoices({ month });
        toast({
          title: "Invoices generated",
          description: `Created ${res.inserted}, skipped ${res.skipped}.`,
        });
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Error",
          description: friendlyErrorMessage(err, "Could not generate invoices"),
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="btn-big">
          <Sparkles className="w-5 h-5" />
          Generate Monthly Invoices
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Monthly Invoices</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            One invoice per occupied flat. Flats already invoiced for this month will be skipped.
          </p>
          <div>
            <Label>Month</Label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onGo} disabled={pending || !month}>
            {pending ? "Generating..." : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
