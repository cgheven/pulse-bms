"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { CalendarCheck, Car, CheckCircle2, Clock, X, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { createVisitorPass, cancelVisitorPass } from "@/app/actions/visitor-passes";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

type PassRow = {
  id: string;
  plate_number: string;
  visitor_name: string | null;
  expected_from: string;
  expected_until: string;
  notes: string | null;
  status: string;
  verified_at: string | null;
  created_at: string;
};

type Props = {
  passes: PassRow[];
  residentIds: string[];
};

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

/** Format a window like "Wed 27 May, 8:00 PM – 11:00 PM" */
function formatWindow(from: string, until: string): string {
  const f = new Date(from);
  const u = new Date(until);
  const sameDay =
    f.getFullYear() === u.getFullYear() &&
    f.getMonth() === u.getMonth() &&
    f.getDate() === u.getDate();

  const dayFmt = new Intl.DateTimeFormat("en-PK", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeFmt = new Intl.DateTimeFormat("en-PK", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (sameDay) {
    return `${dayFmt.format(f)}, ${timeFmt.format(f)} – ${timeFmt.format(u)}`;
  }
  return `${dayFmt.format(f)}, ${timeFmt.format(f)} – ${dayFmt.format(u)}, ${timeFmt.format(u)}`;
}

/** Format a single datetime for "verified at" */
function formatDateTime(dt: string): string {
  return new Intl.DateTimeFormat("en-PK", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(dt));
}

/** Compute the display status — pending passes whose window has passed show as expired */
function computeStatus(pass: PassRow): "pending" | "verified" | "expired" {
  if (pass.status === "verified") return "verified";
  if (pass.status === "expired") return "expired";
  // 'pending' but time has passed → treat as expired in UI
  if (new Date(pass.expected_until) < new Date()) return "expired";
  return "pending";
}

/** Round up to the next 30-minute boundary */
function nextHalfHour(from = new Date()): Date {
  const ms = 30 * 60 * 1000;
  return new Date(Math.ceil(from.getTime() / ms) * ms);
}

/** Format a Date to datetime-local input value (local time) */
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Add hours to a Date */
function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 60 * 60 * 1000);
}

/* ──────────────────────────────────────────────────────────────────────────
 * AddPassForm
 * ────────────────────────────────────────────────────────────────────────── */

function AddPassForm({ onSuccess }: { onSuccess: () => void }) {
  const defaultFrom = nextHalfHour();
  const defaultUntil = addHours(defaultFrom, 3);

  const [plate, setPlate] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [expectedFrom, setExpectedFrom] = useState(toDatetimeLocal(defaultFrom));
  const [expectedUntil, setExpectedUntil] = useState(toDatetimeLocal(defaultUntil));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Min value for the "from" input — prevent obviously past dates (client hint only)
  const minFrom = toDatetimeLocal(new Date(Date.now() - 15 * 60 * 1000));

  /** When From changes, auto-advance Until to From + 3h if Until <= new From */
  function handleFromChange(value: string) {
    setExpectedFrom(value);
    if (value) {
      const fromDate = new Date(value);
      const untilDate = new Date(expectedUntil);
      if (untilDate <= fromDate) {
        setExpectedUntil(toDatetimeLocal(addHours(fromDate, 3)));
      }
    }
  }

  function handlePlateChange(value: string) {
    // Strip invalid chars, uppercase immediately
    setPlate(value.replace(/[^a-zA-Z0-9\- ]/g, "").toUpperCase());
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createVisitorPass({
          plate_number: plate,
          visitor_name: visitorName || null,
          expected_from: expectedFrom,
          expected_until: expectedUntil,
          notes: notes || null,
        });
        // Reset form on success
        setPlate("");
        setVisitorName("");
        const newFrom = nextHalfHour();
        setExpectedFrom(toDatetimeLocal(newFrom));
        setExpectedUntil(toDatetimeLocal(addHours(newFrom, 3)));
        setNotes("");
        onSuccess();
      } catch (err) {
        setError(friendlyErrorMessage(err, "Failed to register visitor pass. Please try again."));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Plate Number */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="vp-plate">
            Number Plate <span className="text-destructive">*</span>
          </label>
          <input
            id="vp-plate"
            type="text"
            required
            maxLength={20}
            value={plate}
            onChange={(e) => handlePlateChange(e.target.value)}
            placeholder="e.g. ABC-1234"
            className={cn(
              "w-full rounded-lg border border-input bg-background px-3 py-2.5",
              "font-mono text-base tracking-widest placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring",
            )}
          />
        </div>

        {/* Visitor Name */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="vp-name">
            Visitor Name <span className="text-muted-foreground text-xs font-normal">(optional)</span>
          </label>
          <input
            id="vp-name"
            type="text"
            maxLength={80}
            value={visitorName}
            onChange={(e) => setVisitorName(e.target.value)}
            placeholder="e.g. Ali Khan"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Expected From */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="vp-from">
            Expected Arrival <span className="text-destructive">*</span>
          </label>
          <input
            id="vp-from"
            type="datetime-local"
            required
            min={minFrom}
            value={expectedFrom}
            onChange={(e) => handleFromChange(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Expected Until */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="vp-until">
            Expected Departure <span className="text-destructive">*</span>
          </label>
          <input
            id="vp-until"
            type="datetime-local"
            required
            min={expectedFrom || minFrom}
            value={expectedUntil}
            onChange={(e) => setExpectedUntil(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="vp-notes">
          Notes <span className="text-muted-foreground text-xs font-normal">(optional, max 200 chars)</span>
        </label>
        <textarea
          id="vp-notes"
          rows={2}
          maxLength={200}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Delivery from Amazon, will ring bell twice"
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        <div className="text-[11px] text-muted-foreground text-right">
          {notes.length}/200
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || !plate}
          className={cn(
            "btn-big bg-primary text-primary-foreground",
            "inline-flex items-center gap-2",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <Plus className="w-4 h-4" />
          {isPending ? "Registering…" : "Register Visitor Pass"}
        </button>
      </div>
    </form>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * PassCard
 * ────────────────────────────────────────────────────────────────────────── */

function PassCard({ pass, onCancel }: { pass: PassRow; onCancel: (id: string) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const displayStatus = computeStatus(pass);
  const canCancel = displayStatus === "pending";

  // Focus the confirm button when confirming state activates
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      try {
        await onCancel(pass.id);
      } catch (err) {
        setError(friendlyErrorMessage(err, "Failed to cancel pass. Please try again."));
        setConfirming(false);
      }
    });
  }

  return (
    <article
      className={cn(
        "card-soft transition-all duration-200",
        displayStatus === "verified" && "border-[hsl(151_100%_41%/0.25)]",
        displayStatus === "pending" && "border-[hsl(38_92%_55%/0.2)]",
        displayStatus === "expired" && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Left: plate + name */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Car className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-mono text-lg font-bold tracking-widest text-foreground">
              {pass.plate_number}
            </span>
            {pass.visitor_name && (
              <span className="text-sm text-muted-foreground">— {pass.visitor_name}</span>
            )}
          </div>

          {/* Time window */}
          <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>{formatWindow(pass.expected_from, pass.expected_until)}</span>
          </div>

          {/* Notes */}
          {pass.notes && (
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{pass.notes}</p>
          )}

          {/* Verified info */}
          {displayStatus === "verified" && pass.verified_at && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-[hsl(151_100%_45%)]">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Verified by Guard at {formatDateTime(pass.verified_at)}</span>
            </div>
          )}

          {error && (
            <p className="mt-2 text-xs text-destructive">{error}</p>
          )}
        </div>

        {/* Right: status badge + cancel */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {/* Status pill */}
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
              displayStatus === "pending" && "status-pending",
              displayStatus === "verified" && "status-paid",
              displayStatus === "expired" && "status-expired",
            )}
          >
            {displayStatus === "pending" && "Awaiting"}
            {displayStatus === "verified" && "Verified ✓"}
            {displayStatus === "expired" && "Expired"}
          </span>

          {/* Cancel */}
          {canCancel && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              disabled={isPending}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          )}

          {canCancel && confirming && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sure?</span>
              <button
                ref={confirmRef}
                onClick={handleCancel}
                disabled={isPending}
                className="text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
              >
                {isPending ? "Cancelling…" : "Yes, cancel"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={isPending}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Keep
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * VisitorPassesClient — main export
 * ────────────────────────────────────────────────────────────────────────── */

export function VisitorPassesClient({ passes }: Props) {
  const [formOpen, setFormOpen] = useState(true);
  const [optimisticPasses, setOptimisticPasses] = useState<PassRow[]>(passes);

  // Keep in sync with server-provided data (revalidation)
  // Using a key-based remount pattern — passes prop changes after revalidatePath.
  // We reset local state each time the server pushes fresh data.
  const [serverPasses, setServerPasses] = useState<PassRow[]>(passes);
  if (passes !== serverPasses) {
    setServerPasses(passes);
    setOptimisticPasses(passes);
  }

  async function handleCancel(passId: string) {
    // Optimistic removal
    setOptimisticPasses((prev) => prev.filter((p) => p.id !== passId));
    await cancelVisitorPass(passId);
  }

  const activePasses = optimisticPasses.filter((p) => computeStatus(p) !== "expired");
  const expiredPasses = optimisticPasses.filter((p) => computeStatus(p) === "expired");

  return (
    <div className="space-y-6">
      {/* ── Add Pass Form ──────────────────────────────────────────────── */}
      <div className="card-soft">
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold">Register a New Visitor Pass</h2>
          </div>
          {formOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {formOpen && (
          <div className="mt-5 pt-5 border-t border-border">
            <AddPassForm onSuccess={() => setFormOpen(true)} />
          </div>
        )}
      </div>

      {/* ── Active / Verified Passes ───────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Active &amp; Recent Passes
        </h2>

        {activePasses.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <CalendarCheck className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No visitor passes yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Register one above when you&apos;re expecting a guest, delivery, or family member.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activePasses.map((pass) => (
              <PassCard key={pass.id} pass={pass} onCancel={handleCancel} />
            ))}
          </div>
        )}
      </div>

      {/* ── Expired Passes (collapsed by default if any) ───────────────── */}
      {expiredPasses.length > 0 && (
        <ExpiredSection passes={expiredPasses} onCancel={handleCancel} />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * ExpiredSection — collapsible
 * ────────────────────────────────────────────────────────────────────────── */

function ExpiredSection({
  passes,
  onCancel,
}: {
  passes: PassRow[];
  onCancel: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Expired Passes ({passes.length})
      </button>

      {open && (
        <div className="space-y-3">
          {passes.map((pass) => (
            <PassCard key={pass.id} pass={pass} onCancel={onCancel} />
          ))}
        </div>
      )}
    </div>
  );
}
