"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { raiseComplaint, type ComplaintCategory, type ComplaintPriority } from "@/app/actions/resident";

const CATEGORIES: { value: ComplaintCategory; label: string }[] = [
  { value: "water",       label: "Water" },
  { value: "electricity", label: "Electricity" },
  { value: "lift",        label: "Lift" },
  { value: "cleanliness", label: "Cleanliness" },
  { value: "security",    label: "Security" },
  { value: "noise",       label: "Noise" },
  { value: "other",       label: "Other" },
];

const PRIORITIES: { value: ComplaintPriority; label: string }[] = [
  { value: "low",    label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high",   label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function ComplaintDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ComplaintCategory>("other");
  const [priority, setPriority] = useState<ComplaintPriority>("normal");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function submit() {
    if (!title.trim()) {
      toast({ title: "Title needed", description: "Please add a short title for your complaint." });
      return;
    }
    startTransition(async () => {
      try {
        await raiseComplaint({
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
        });
        toast({ title: "Complaint raised", description: "Admin will see your complaint shortly." });
        setOpen(false);
        setTitle("");
        setDescription("");
        setCategory("other");
        setPriority("normal");
        router.refresh();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not raise complaint";
        toast({ title: "Failed", description: msg, variant: "destructive" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="btn-big">
          <Plus className="w-5 h-5" />
          Raise Complaint
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Raise a Complaint</DialogTitle>
          <DialogDescription className="text-base">
            Tell us what is wrong. Admin will see this on their dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="c-title" className="text-base">Title</Label>
            <Input
              id="c-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary, e.g. Lift not working"
              className="h-12 text-base"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-desc" className="text-base">Details</Label>
            <Textarea
              id="c-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When did it start? Which floor? Any other info..."
              rows={4}
              className="text-base"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-base">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ComplaintCategory)}>
                <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="text-base">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-base">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as ComplaintPriority)}>
                <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value} className="text-base">{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending} className="btn-big">
            {isPending ? "Submitting..." : "Submit Complaint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
