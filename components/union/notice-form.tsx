"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";
import { createUnionNotice, deleteUnionNotice } from "@/app/actions/union-notices";
import { friendlyErrorMessage } from "@/lib/toast-error";

type NoticeType = "general" | "urgent" | "maintenance" | "event";

export function NoticeForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<NoticeType>("general");
  const [pinned, setPinned] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!title.trim() || !body.trim()) {
      toast({ title: "Title and message required", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      try {
        await createUnionNotice({
          title: title.trim(),
          body: body.trim(),
          notice_type: type,
          pinned,
        });
        toast({ title: "Notice posted" });
        setOpen(false);
        setTitle("");
        setBody("");
        setType("general");
        setPinned(false);
      } catch (e) {
        const msg = friendlyErrorMessage(e, "Failed to post notice");
        toast({ title: "Could not post", description: msg, variant: "destructive" });
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="btn-big bg-primary text-primary-foreground hover:bg-primary/90">
        <Plus className="w-5 h-5" />
        New notice
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!pending) setOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post a notice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="n-title">Title</Label>
              <Input id="n-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="n-body">Message</Label>
              <Textarea id="n-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="n-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as NoticeType)}>
                <SelectTrigger id="n-type" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="w-5 h-5"
              />
              <span>Pin to top</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Posting…
                </>
              ) : (
                "Post notice"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteNoticeButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  function run() {
    startTransition(async () => {
      try {
        await deleteUnionNotice(id);
        toast({ title: "Notice deleted" });
        setOpen(false);
      } catch (e) {
        const msg = friendlyErrorMessage(e, "Failed to delete notice");
        toast({ title: "Could not delete", description: msg, variant: "destructive" });
      }
    });
  }
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} disabled={pending} aria-label="Delete notice">
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete this notice?"
        description="Residents will no longer see this notice."
        confirmLabel="Delete"
        onConfirm={run}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
