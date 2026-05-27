"use client";

import { useState, useRef, useTransition, useCallback } from "react";
import { Search, Car, CheckCircle2, XCircle, AlertCircle, ShieldCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  searchVehicles,
  getMatchingVisitorPass,
  verifyVisitorPass,
  type VehicleLookupRow,
  type VisitorPassResult,
} from "@/app/actions/guard";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";

/* ─────────────────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────────────────── */

const RELATIONSHIP_LABELS: Record<string, string> = {
  owner:  "Owner",
  tenant: "Tenant",
  family: "Family Member",
};

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  car:   "Car",
  bike:  "Bike",
  ev:    "Electric Vehicle",
  other: "Vehicle",
};

function vehicleDescription(row: VehicleLookupRow): string {
  const type = VEHICLE_TYPE_LABELS[row.vehicle_type] ?? "Vehicle";
  const parts = [row.color, row.make, row.model].filter(Boolean).join(" ");
  return parts ? `${type} · ${parts}` : type;
}

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

/* ─────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ───────────────────────────────────────────────────────────────────────── */

function EmptyPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center select-none">
      <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-muted/60 border border-border mb-3">
        <Car className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">Enter a plate number above</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Type a full or partial plate to check if a vehicle is registered in this building.
      </p>
    </div>
  );
}

function NoResultsState({ query, hasPass }: { query: string; hasPass: boolean }) {
  if (hasPass) return null;
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center select-none">
      <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-destructive/10 border border-destructive/20 mb-3">
        <XCircle className="w-5 h-5 text-destructive" />
      </div>
      <p className="text-sm font-semibold text-foreground">Not Registered</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        No vehicle matching{" "}
        <span className="font-mono font-bold text-foreground">{query}</span>{" "}
        is registered — and no active visitor pass found.
      </p>
      <span className="mt-3 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border status-overdue">
        Not Registered
      </span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/10">
      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
      <p className="text-sm text-destructive">{message}</p>
    </div>
  );
}

function VehicleResultCard({ row }: { row: VehicleLookupRow }) {
  const relationship = RELATIONSHIP_LABELS[row.relationship] ?? row.relationship;
  const description = vehicleDescription(row);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      {/* Left: plate + vehicle info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-bold tracking-widest text-foreground uppercase">
            {row.plate_number}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border status-paid">
            <CheckCircle2 className="w-3 h-3" />
            Registered
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>

      <div className="hidden sm:block h-8 w-px bg-border shrink-0" />

      {/* Right: resident + flat */}
      <div className="flex-shrink-0 sm:text-right">
        <p className="text-sm font-semibold text-foreground leading-tight">{row.full_name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{relationship}</p>
        <p className="text-xs font-medium text-primary mt-0.5">Flat {row.flat_number}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Visitor Pass Banner
 * ───────────────────────────────────────────────────────────────────────── */

interface VisitorPassBannerProps {
  pass: VisitorPassResult;
  onVerified: (passId: string, verifiedAt: string) => void;
}

function VisitorPassBanner({ pass, onVerified }: VisitorPassBannerProps) {
  const { toast } = useToast();
  const [isVerifying, startVerifyTransition] = useTransition();
  const timeWindow = formatTimeWindow(pass.expected_from, pass.expected_until);

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
        const now = new Date().toLocaleTimeString("en-PK", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        onVerified(pass.id, now);
        toast({
          title: "Visitor pass verified",
          description: `${pass.visitor_name ?? pass.plate_number} marked as arrived.`,
        });
      }
    });
  }

  return (
    <div className="rounded-xl border border-[hsl(38_92%_55%/0.35)] bg-[hsl(38_92%_55%/0.08)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-[hsl(38_92%_65%)] shrink-0" />
        <span className="text-xs font-bold tracking-widest text-[hsl(38_92%_65%)] uppercase">
          Pre-Authorized Visitor
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        <div className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground uppercase tracking-wider w-14 shrink-0">Plate</span>
          <span className="font-mono font-bold text-foreground tracking-widest">
            {pass.plate_number}
          </span>
        </div>
        {pass.visitor_name && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground uppercase tracking-wider w-14 shrink-0">Visitor</span>
            <span className="font-medium text-foreground">{pass.visitor_name}</span>
          </div>
        )}
        <div className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground uppercase tracking-wider w-14 shrink-0">Host</span>
          <span className="font-medium text-foreground">
            {pass.resident_name}{" "}
            <span className="text-primary font-semibold">· Flat {pass.flat_number}</span>
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground uppercase tracking-wider w-14 shrink-0">Window</span>
          <span className="text-foreground flex items-center gap-1">
            <Clock className="w-3 h-3 text-muted-foreground" />
            {timeWindow}
          </span>
        </div>
        {pass.notes && (
          <div className="flex items-baseline gap-1.5 sm:col-span-2">
            <span className="text-muted-foreground uppercase tracking-wider w-14 shrink-0">Note</span>
            <span className="text-muted-foreground italic">{pass.notes}</span>
          </div>
        )}
      </div>

      <div className="pt-0.5">
        <button
          onClick={handleVerify}
          disabled={isVerifying}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
            "bg-[hsl(38_92%_55%)] text-[hsl(220_28%_8%)]",
            "hover:bg-[hsl(38_92%_60%)] active:scale-[0.98]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {isVerifying ? (
            <>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[hsl(220_28%_8%)/40] border-t-[hsl(220_28%_8%)] animate-spin" />
              Verifying…
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Mark as Verified
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function VisitorPassVerifiedBadge({
  pass,
  verifiedAt,
}: {
  pass: VisitorPassResult;
  verifiedAt: string;
}) {
  return (
    <div className="rounded-xl border border-[hsl(151_100%_41%/0.25)] bg-[hsl(151_100%_41%/0.08)] p-4 space-y-1.5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-[hsl(151_100%_45%)] shrink-0" />
        <span className="text-xs font-bold tracking-widest text-[hsl(151_100%_45%)] uppercase">
          Visitor Verified
        </span>
        <span className="ml-auto text-xs text-muted-foreground">at {verifiedAt}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-mono font-bold text-foreground">{pass.plate_number}</span>
        {pass.visitor_name ? ` (${pass.visitor_name})` : ""} — admitted.{" "}
        Registered by{" "}
        <span className="font-medium text-foreground">{pass.resident_name}</span>,{" "}
        Flat {pass.flat_number}.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Main component
 * ───────────────────────────────────────────────────────────────────────── */

interface VehicleSearchProps {
  buildingId: string | null;
}

type PassState =
  | { kind: "none" }
  | { kind: "found"; pass: VisitorPassResult }
  | { kind: "verified"; pass: VisitorPassResult; verifiedAt: string };

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; query: string; rows: VehicleLookupRow[]; passState: PassState }
  | { kind: "error"; message: string };

export function VehicleSearch({ buildingId }: VehicleSearchProps) {
  const [inputValue, setInputValue] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setState({ kind: "idle" });
      return;
    }

    startTransition(async () => {
      setState({ kind: "loading" });

      const [vehicleResult, passResult] = await Promise.all([
        searchVehicles(trimmed),
        getMatchingVisitorPass(trimmed),
      ]);

      if (vehicleResult.error && passResult.error) {
        setState({ kind: "error", message: vehicleResult.error });
        return;
      }

      const topPass = passResult.data?.[0] ?? null;
      const passState: PassState = topPass ? { kind: "found", pass: topPass } : { kind: "none" };

      setState({
        kind: "results",
        query: trimmed.toUpperCase(),
        rows: vehicleResult.data ?? [],
        passState,
      });
    });
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 300);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runSearch(inputValue);
  }

  function handlePassVerified(passId: string, verifiedAt: string) {
    setState((prev) => {
      if (prev.kind !== "results") return prev;
      if (prev.passState.kind !== "found") return prev;
      if (prev.passState.pass.id !== passId) return prev;
      return { ...prev, passState: { kind: "verified", pass: prev.passState.pass, verifiedAt } };
    });
  }

  if (!buildingId) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <ErrorState message="Your guard account is not assigned to a building. Please contact the administrator." />
      </div>
    );
  }

  const isLoading = isPending || state.kind === "loading";

  return (
    <div className="space-y-3">
      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors",
              isLoading ? "text-primary animate-pulse" : "text-muted-foreground",
            )}
          />
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder="Plate number — e.g. ABC-123"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            aria-label="Vehicle plate number"
            className={cn(
              "w-full h-11 pl-9 pr-4 rounded-xl border bg-card text-foreground placeholder:text-muted-foreground",
              "text-sm font-mono tracking-wider uppercase",
              "border-border focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50",
              "transition-all duration-150",
            )}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          className={cn(
            "h-11 px-5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "hover:bg-primary/90 active:scale-[0.98] transition-all",
          )}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
              Searching…
            </span>
          ) : (
            "Search"
          )}
        </button>
      </form>

      {/* Results area */}
      <div className="space-y-3">
        {state.kind === "idle" && <EmptyPrompt />}
        {state.kind === "error" && <ErrorState message={state.message} />}

        {state.kind === "results" && (
          <>
            {state.passState.kind === "found" && (
              <VisitorPassBanner pass={state.passState.pass} onVerified={handlePassVerified} />
            )}
            {state.passState.kind === "verified" && (
              <VisitorPassVerifiedBadge pass={state.passState.pass} verifiedAt={state.passState.verifiedAt} />
            )}

            {state.rows.length === 0 ? (
              <NoResultsState query={state.query} hasPass={state.passState.kind !== "none"} />
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider px-0.5">
                  {state.rows.length} vehicle{state.rows.length !== 1 ? "s" : ""} found for{" "}
                  <span className="font-mono text-foreground">{state.query}</span>
                </p>
                {state.rows.map((row, i) => (
                  <VehicleResultCard key={`${row.plate_number}-${i}`} row={row} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
