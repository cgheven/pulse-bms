"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Loader2, Lock, Unlock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  createElection,
  openElection,
  closeElection,
  deleteElection,
} from "@/app/actions/union";

type Election = {
  id: string;
  cycle_label: string;
  scheduled_date: string;
  status: string | null;
  results: Record<string, unknown> | null;
};

const STATUS_PILL: Record<string, string> = {
  scheduled: "bg-amber-100 text-amber-800 border border-amber-300",
  open: "bg-blue-100 text-blue-800 border border-blue-300",
  closed: "bg-gray-200 text-gray-700 border border-gray-300",
};

export function ElectionsTab({ elections }: { elections: Election[] }) {
  const [open, setOpen] = useState(false);
  const [cycle, setCycle] = useState("");
  const [date, setDate] = useState("");
  const [pending, startTransition] = useTransition();

  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeText, setCloseText] = useState("");
  const [closePending, startClose] = useTransition();

  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removePending, startRemove] = useTransition();

  function create() {
    if (!cycle.trim() || !date) {
      toast({ title: "Cycle label and date required", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      try {
        await createElection({ cycle_label: cycle.trim(), scheduled_date: date });
        toast({ title: "Election scheduled" });
        setOpen(false);
        setCycle("");
        setDate("");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to schedule";
        toast({ title: "Could not schedule", description: msg, variant: "destructive" });
      }
    });
  }

  function doOpen(id: string) {
    startTransition(async () => {
      try {
        await openElection(id);
        toast({ title: "Voting opened" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed";
        toast({ title: "Could not open", description: msg, variant: "destructive" });
      }
    });
  }

  function doClose() {
    if (!closingId) return;
    let results: Record<string, unknown> = {};
    if (closeText.trim()) {
      try {
        results = JSON.parse(closeText);
      } catch {
        results = { notes: closeText.trim() };
      }
    }
    startClose(async () => {
      try {
        await closeElection(closingId, results);
        toast({ title: "Election closed" });
        setClosingId(null);
        setCloseText("");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed";
        toast({ title: "Could not close", description: msg, variant: "destructive" });
      }
    });
  }

  function doDelete() {
    if (!removeId) return;
    startRemove(async () => {
      try {
        await deleteElection(removeId);
        toast({ title: "Election deleted" });
        setRemoveId(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed";
        toast({ title: "Could not delete", description: msg, variant: "destructive" });
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-muted-foreground">
          Schedule election cycles and record outcomes.
        </p>
        <Button
          onClick={() => setOpen(true)}
          className="btn-big bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <CalendarPlus className="w-5 h-5" />
          New election
        </Button>
      </div>

      <div className="card-soft p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-secondary text-sm uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Cycle</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Results</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {elections.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No elections scheduled.
                </td>
              </tr>
            ) : (
              elections.map((e) => {
                const status = e.status ?? "scheduled";
                return (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{e.cycle_label}</td>
                    <td className="px-4 py-3">{formatDate(e.scheduled_date)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          STATUS_PILL[status] ?? STATUS_PILL.scheduled
                        }`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {e.results ? (
                        <code className="text-xs bg-secondary px-2 py-0.5 rounded">recorded</code>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        {status === "scheduled" && (
                          <Button size="sm" variant="outline" onClick={() => doOpen(e.id)} disabled={pending}>
                            <Unlock className="w-4 h-4" />
                            Open voting
                          </Button>
                        )}
                        {status === "open" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setClosingId(e.id)}
                            disabled={closePending}
                          >
                            <Lock className="w-4 h-4" />
                            Close
                          </Button>
                        )}
                        {status !== "open" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setRemoveId(e.id)}
                            disabled={removePending}
                            aria-label="Delete election"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!pending) setOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule a new election</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="e-cycle">Cycle label</Label>
              <Input
                id="e-cycle"
                value={cycle}
                onChange={(e) => setCycle(e.target.value)}
                placeholder="2026 Spring Committee"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-date">Scheduled date</Label>
              <Input
                id="e-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={create} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                </>
              ) : (
                "Schedule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!closingId} onOpenChange={(o) => { if (!o && !closePending) setClosingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close election</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="close-results">Results / notes</Label>
            <Textarea
              id="close-results"
              value={closeText}
              onChange={(e) => setCloseText(e.target.value)}
              rows={6}
              placeholder='e.g., "President: Ahmed (12 votes), VP: Sara (10 votes)…"'
            />
            <p className="text-xs text-muted-foreground">
              Saved as JSON if it parses; otherwise stored under a notes field.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosingId(null)} disabled={closePending}>
              Cancel
            </Button>
            <Button onClick={doClose} disabled={closePending}>
              {closePending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Closing…
                </>
              ) : (
                "Close election"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removeId}
        title="Delete this election?"
        description="This is a permanent action."
        confirmLabel="Delete"
        onConfirm={doDelete}
        onCancel={() => setRemoveId(null)}
      />
    </div>
  );
}
