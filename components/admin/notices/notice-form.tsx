"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createNotice,
  updateNotice,
  type NoticeInput,
  type NoticeType,
} from "@/app/actions/notices";

const NOTICE_TYPES: Record<NoticeType, string> = {
  general: "General",
  dues_reminder: "Dues Reminder",
  meeting: "Meeting",
  election: "Election",
  emergency: "Emergency",
};

export function NoticeForm({
  open,
  onOpenChange,
  notice,
  defaulterTemplate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  notice?: (NoticeInput & { id: string }) | null;
  defaulterTemplate?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NoticeInput>({
    title: notice?.title ?? "",
    body: notice?.body ?? "",
    notice_type: (notice?.notice_type as NoticeType) ?? "general",
    pinned: notice?.pinned ?? false,
    expires_at: notice?.expires_at ?? null,
  });

  const onTypeChange = (v: NoticeType) => {
    const next: NoticeInput = { ...form, notice_type: v };
    if (
      v === "dues_reminder" &&
      defaulterTemplate &&
      (!form.body.trim() || form.notice_type !== "dues_reminder")
    ) {
      next.body = defaulterTemplate;
      if (!form.title.trim()) next.title = "Outstanding Dues Reminder";
    }
    setForm(next);
  };

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        if (notice?.id) {
          await updateNotice(notice.id, form);
        } else {
          await createNotice(form);
        }
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{notice ? "Edit notice" : "New notice"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Type</Label>
            <Select
              value={form.notice_type ?? "general"}
              onValueChange={(v) => onTypeChange(v as NoticeType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(NOTICE_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="exp">Expires on (optional)</Label>
            <Input
              id="exp"
              type="date"
              value={form.expires_at ? form.expires_at.split("T")[0] : ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  expires_at: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null,
                })
              }
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="body">Body</Label>
            <Textarea
              id="body"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={8}
            />
          </div>

          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              id="pin"
              type="checkbox"
              className="h-5 w-5"
              checked={!!form.pinned}
              onChange={(e) =>
                setForm({ ...form, pinned: e.target.checked })
              }
            />
            <Label htmlFor="pin">Pin to top</Label>
          </div>
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !form.title.trim() || !form.body.trim()}
          >
            {pending ? "Saving..." : notice ? "Save" : "Publish notice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
