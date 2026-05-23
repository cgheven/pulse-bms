"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PhoneCall,
  MessageCircle,
  Handshake,
  Video,
  StickyNote,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { logFollowup, type FollowupChannel } from "@/app/actions/leads";

const CHANNELS: {
  value: FollowupChannel;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "call", label: "Call", Icon: PhoneCall },
  { value: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
  { value: "meeting", label: "Meeting", Icon: Handshake },
  { value: "demo", label: "Demo", Icon: Video },
  { value: "other", label: "Other", Icon: StickyNote },
];

/**
 * Structured per-touchpoint follow-up entry. Each save creates one row
 * on bms_lead_activities (with channel-mapped activity_type, the verbatim
 * response, and an optional follow-up date) and the server syncs the
 * lead's denormalised next_followup_date so the KPI surface keeps
 * working.
 *
 * Replaces the legacy free-form ActivityForm on the lead detail page.
 */
export function LogFollowupForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [channel, setChannel] = useState<FollowupChannel>("call");
  const [response, setResponse] = useState("");
  const [nextDate, setNextDate] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const canSubmit = response.trim().length > 0 && !isPending;

  function reset() {
    setChannel("call");
    setResponse("");
    setNextDate("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!response.trim()) {
      toast({
        title: "Please describe what response you received",
        variant: "destructive",
      });
      return;
    }
    startTransition(async () => {
      try {
        await logFollowup({
          lead_id: leadId,
          channel,
          response,
          next_followup_date: nextDate || null,
        });
        toast({ title: "Follow-up logged" });
        reset();
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
    <form
      onSubmit={submit}
      className="card-soft space-y-4 border border-border"
    >
      <div>
        <h3 className="text-base font-semibold">Log a Follow-up</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Capture what happened and (optionally) lock in the next touch.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm">Channel</Label>
          <Select
            value={channel}
            onValueChange={(v) => setChannel(v as FollowupChannel)}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  <span className="inline-flex items-center gap-2">
                    <c.Icon className="w-4 h-4" />
                    {c.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="followup_response" className="text-sm">
            Response <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="followup_response"
            rows={3}
            placeholder="What did they say? Did they ask any questions?"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3">
        <div className="space-y-1.5">
          <Label
            htmlFor="followup_next_date"
            className="text-sm inline-flex items-center gap-1.5"
          >
            <CalendarClock className="w-3.5 h-3.5 text-muted-foreground" />
            Next on
          </Label>
          {/* Native date input — always clickable across browsers, no
              z-index / portal issues. The Popover-based DatePicker had
              click-target problems inside this form. */}
          <Input
            id="followup_next_date"
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank if no follow-up planned.
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={reset}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit} className="btn-big">
          {isPending ? "Saving..." : "Save Follow-up"}
        </Button>
      </div>
    </form>
  );
}
