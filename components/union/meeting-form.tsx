"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Pencil } from "lucide-react";
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
import { toast } from "@/hooks/use-toast";
import { createMeeting, updateMeeting } from "@/app/actions/meetings";

type Meeting = {
  id: string;
  title: string;
  scheduled_at: string;
  location: string | null;
  agenda: string | null;
  minutes: string | null;
  status: string;
};

export function MeetingForm({
  mode,
  meeting,
  triggerVariant = "primary",
}: {
  mode: "create" | "edit-minutes";
  meeting?: Meeting;
  triggerVariant?: "primary" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [when, setWhen] = useState(meeting ? toLocalInput(meeting.scheduled_at) : "");
  const [location, setLocation] = useState(meeting?.location ?? "");
  const [agenda, setAgenda] = useState(meeting?.agenda ?? "");
  const [minutes, setMinutes] = useState(meeting?.minutes ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (mode === "create") {
      if (!title.trim() || !when) {
        toast({ title: "Title and date/time are required", variant: "destructive" });
        return;
      }
      startTransition(async () => {
        try {
          await createMeeting({
            title: title.trim(),
            scheduled_at: new Date(when).toISOString(),
            location: location.trim() || undefined,
            agenda: agenda.trim() || undefined,
          });
          toast({ title: "Meeting scheduled" });
          setOpen(false);
          setTitle("");
          setWhen("");
          setLocation("");
          setAgenda("");
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed to create meeting";
          toast({ title: "Could not schedule", description: msg, variant: "destructive" });
        }
      });
    } else if (mode === "edit-minutes" && meeting) {
      startTransition(async () => {
        try {
          await updateMeeting(meeting.id, {
            minutes: minutes.trim() || null,
            status: "completed",
          });
          toast({ title: "Meeting marked complete", description: "Minutes saved." });
          setOpen(false);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed to save minutes";
          toast({ title: "Could not save", description: msg, variant: "destructive" });
        }
      });
    }
  }

  return (
    <>
      {mode === "create" ? (
        <Button
          onClick={() => setOpen(true)}
          className={
            triggerVariant === "primary"
              ? "btn-big bg-primary text-primary-foreground hover:bg-primary/90"
              : ""
          }
          variant={triggerVariant === "outline" ? "outline" : "default"}
        >
          <Plus className="w-5 h-5" />
          Schedule meeting
        </Button>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Pencil className="w-4 h-4" />
          {meeting?.status === "completed" ? "Edit minutes" : "Add minutes & close"}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!pending) setOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Schedule a meeting" : "Meeting minutes"}
            </DialogTitle>
          </DialogHeader>

          {mode === "create" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mtg-title">Title</Label>
                <Input
                  id="mtg-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-11"
                  placeholder="Monthly committee meeting"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mtg-when">Date & time</Label>
                <Input
                  id="mtg-when"
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mtg-loc">Location</Label>
                <Input
                  id="mtg-loc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="h-11"
                  placeholder="Ground floor lobby"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mtg-agenda">Agenda</Label>
                <Textarea
                  id="mtg-agenda"
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  rows={4}
                  placeholder="Items to discuss…"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mtg-minutes">Minutes</Label>
                <Textarea
                  id="mtg-minutes"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  rows={8}
                  placeholder="Decisions made, action items, next steps…"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                </>
              ) : mode === "create" ? (
                "Schedule"
              ) : (
                "Save minutes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
