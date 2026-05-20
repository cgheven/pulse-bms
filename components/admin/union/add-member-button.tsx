"use client";

import { useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { addUnionMember, type UnionPosition } from "@/app/actions/union";

type Candidate = {
  id: string;
  full_name: string | null;
  email: string | null;
};

const POSITIONS: { value: UnionPosition; label: string }[] = [
  { value: "president", label: "President" },
  { value: "vp",        label: "Vice President" },
  { value: "secretary", label: "Secretary" },
  { value: "treasurer", label: "Treasurer" },
  { value: "member",    label: "Member" },
];

export function AddMemberButton({ candidates }: { candidates: Candidate[] }) {
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState<string>(candidates[0]?.id ?? "");
  const [position, setPosition] = useState<UnionPosition>("member");
  const today = new Date();
  const oneYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
  const [termStart, setTermStart] = useState(today.toISOString().slice(0, 10));
  const [termEnd, setTermEnd] = useState(oneYear.toISOString().slice(0, 10));
  const [pending, startTransition] = useTransition();

  function add() {
    if (!profileId) {
      toast({ title: "Pick a resident first", variant: "destructive" });
      return;
    }
    const candidate = candidates.find((c) => c.id === profileId);
    if (!candidate) return;
    startTransition(async () => {
      try {
        await addUnionMember({
          profile_id: profileId,
          full_name: candidate.full_name ?? candidate.email ?? "Union member",
          position,
          term_start: termStart,
          term_end: termEnd,
        });
        toast({ title: "Union member added" });
        setOpen(false);
      } catch (e) {
        toast({
          title: "Could not add",
          description: friendlyErrorMessage(e),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="shrink-0 self-start gap-1.5">
        <UserPlus className="w-4 h-4" />
        Add Member
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!pending) setOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add union member</DialogTitle>
            <DialogDescription>
              Promote an existing resident to the union committee.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="m-profile">Resident</Label>
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No residents available. Add residents to this building first.
                </p>
              ) : (
                <Select value={profileId} onValueChange={setProfileId}>
                  <SelectTrigger id="m-profile" className="h-11">
                    <SelectValue placeholder="Pick a resident" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name ?? c.email ?? c.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="m-pos">Position</Label>
              <Select value={position} onValueChange={(v) => setPosition(v as UnionPosition)}>
                <SelectTrigger id="m-pos" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="m-start">Term start</Label>
                <Input
                  id="m-start"
                  type="date"
                  value={termStart}
                  onChange={(e) => setTermStart(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-end">Term end</Label>
                <Input
                  id="m-end"
                  type="date"
                  value={termEnd}
                  onChange={(e) => setTermEnd(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={add} disabled={pending || candidates.length === 0}>
              {pending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</>
              ) : (
                "Add Member"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
