"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { sendDigestNow } from "@/app/actions/followup-digest";

export function SendFollowupDigestButton() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [lastSent, setLastSent] = useState<string | null>(null);

  function handleClick() {
    startTransition(async () => {
      const result = await sendDigestNow();
      if (!result.sent) {
        toast({
          title: "Digest not sent",
          description: result.reason,
          variant: "destructive",
        });
        return;
      }
      const label = [
        result.todayCount > 0 ? `${result.todayCount} due today` : null,
        result.overdueCount > 0 ? `${result.overdueCount} overdue` : null,
      ].filter(Boolean).join(", ");
      setLastSent(new Date().toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }));
      toast({
        title: "Digest sent!",
        description: `Email delivered — ${label}.`,
      });
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-1.5"
        onClick={handleClick}
        disabled={isPending}
      >
        <Mail className="w-4 h-4" />
        {isPending ? "Sending…" : "Send Follow-up Digest"}
      </Button>
      {lastSent && (
        <p className="text-xs text-muted-foreground">Last sent at {lastSent}</p>
      )}
    </div>
  );
}
