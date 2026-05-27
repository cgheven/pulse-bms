"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CalendarClock, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { verifyVisitorPass, type VisitorPassResult } from "@/app/actions/guard";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";

function formatTimeWindow(from: string, until: string): string {
  const fromDate = new Date(from);
  const untilDate = new Date(until);
  const now = new Date();

  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };

  const fromTime = fromDate.toLocaleTimeString("en-PK", timeOpts);
  const untilTime = untilDate.toLocaleTimeString("en-PK", timeOpts);

  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  const tomorrowMidnight = new Date(todayMidnight);
  tomorrowMidnight.setDate(todayMidnight.getDate() + 1);

  const untilMidnight = new Date(untilDate);
  untilMidnight.setHours(0, 0, 0, 0);

  let dayLabel = "";
  if (untilMidnight.getTime() === todayMidnight.getTime()) {
    dayLabel = " today";
  } else if (untilMidnight.getTime() === tomorrowMidnight.getTime()) {
    dayLabel = " tomorrow";
  } else {
    dayLabel = " on " + untilDate.toLocaleDateString("en-PK", { month: "short", day: "numeric" });
  }

  return `${fromTime} – ${untilTime}${dayLabel}`;
}

interface PassCardProps {
  pass: VisitorPassResult;
  onVerified: (passId: string) => void;
}

function PassCard({ pass, onVerified }: PassCardProps) {
  const { toast } = useToast();
  const [isVerifying, startVerifyTransition] = useTransition();
  const timeWindow = formatTimeWindow(pass.expected_from, pass.expected_until);

  const isNow =
    new Date(pass.expected_from) <= new Date() &&
    new Date(pass.expected_until) >= new Date();

  function handleVerify() {
    startVerifyTransition(async () => {
      const result = await verifyVisitorPass(pass.id);
      if (result.error) {
        toast({
          title: "Could not verify pass",
          description: friendlyErrorMessage(new Error(result.error)),
          variant: "destructive",
        });
      } else {
        onVerified(pass.id);
        toast({
          title: "Visitor arrived",
          description: `${pass.visitor_name ?? pass.plate_number} marked as arrived.`,
        });
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4",
        isNow && "border-[hsl(38_92%_55%/0.3)] bg-[hsl(38_92%_55%/0.04)]",
      )}
    >
      {/* Left: plate + visitor info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-bold tracking-widest text-foreground uppercase">
            {pass.plate_number}
          </span>
          {isNow && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border status-pending">
              <Clock className="w-3 h-3" />
              Expected now
            </span>
          )}
        </div>

        {pass.visitor_name && (
          <p className="text-xs font-medium text-foreground">{pass.visitor_name}</p>
        )}

        <p className="text-xs text-muted-foreground">
          Registered by{" "}
          <span className="font-semibold text-foreground">{pass.resident_name}</span>
          {" · "}
          <span className="text-primary font-medium">Flat {pass.flat_number}</span>
        </p>

        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <CalendarClock className="w-3 h-3 shrink-0" />
          {timeWindow}
        </p>

        {pass.notes && (
          <p className="text-xs text-muted-foreground italic">Note: {pass.notes}</p>
        )}
      </div>

      {/* Action */}
      <div className="shrink-0">
        <button
          onClick={handleVerify}
          disabled={isVerifying}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all",
            "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {isVerifying ? (
            <>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
              Verifying…
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Mark Arrived
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface PendingPassesProps {
  passes: VisitorPassResult[];
}

export function PendingPasses({ passes: initialPasses }: PendingPassesProps) {
  const [passes, setPasses] = useState<VisitorPassResult[]>(initialPasses);

  function handleVerified(passId: string) {
    setPasses((prev) => prev.filter((p) => p.id !== passId));
  }

  if (passes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center select-none">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted/60 border border-border mb-3">
          <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No visitor passes scheduled</p>
        <p className="text-xs text-muted-foreground mt-1">All clear — no expected visitors in the next 24 hours.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
        {passes.length} pass{passes.length !== 1 ? "es" : ""} expected
      </p>
      {passes.map((pass) => (
        <PassCard key={pass.id} pass={pass} onVerified={handleVerified} />
      ))}
    </div>
  );
}
