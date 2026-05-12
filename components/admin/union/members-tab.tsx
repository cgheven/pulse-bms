"use client";

import { useState, useTransition } from "react";
import { Loader2, UserPlus, Trash2 } from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  addUnionMember,
  removeUnionMember,
  type UnionPosition,
} from "@/app/actions/union";

type Member = {
  id: string;
  full_name: string;
  position: string | null;
  term_start: string;
  term_end: string;
  is_active: boolean | null;
  profile_id: string;
};

type Candidate = {
  id: string;
  full_name: string | null;
  email: string | null;
};

const POSITIONS: { value: UnionPosition; label: string }[] = [
  { value: "president", label: "President" },
  { value: "vp", label: "Vice President" },
  { value: "secretary", label: "Secretary" },
  { value: "treasurer", label: "Treasurer" },
  { value: "member", label: "Member" },
];

const POSITION_LABEL: Record<string, string> = {
  president: "President",
  vp: "Vice President",
  secretary: "Secretary",
  treasurer: "Treasurer",
  member: "Member",
};

export function MembersTab({
  members,
  candidates,
}: {
  members: Member[];
  candidates: Candidate[];
}) {
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState<string>(candidates[0]?.id ?? "");
  const [position, setPosition] = useState<UnionPosition>("member");
  const today = new Date();
  const oneYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
  const [termStart, setTermStart] = useState(today.toISOString().slice(0, 10));
  const [termEnd, setTermEnd] = useState(oneYear.toISOString().slice(0, 10));
  const [pending, startTransition] = useTransition();

  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removePending, startRemove] = useTransition();

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
        const msg = e instanceof Error ? e.message : "Failed to add";
        toast({ title: "Could not add", description: msg, variant: "destructive" });
      }
    });
  }

  function confirmRemove() {
    if (!removeTarget) return;
    startRemove(async () => {
      try {
        await removeUnionMember(removeTarget);
        toast({ title: "Union member removed" });
        setRemoveTarget(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to remove";
        toast({ title: "Could not remove", description: msg, variant: "destructive" });
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-muted-foreground">
          Active committee members for this building. Adding a resident here promotes them to the
          Union role.
        </p>
        <Button
          onClick={() => setOpen(true)}
          className="btn-big bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <UserPlus className="w-5 h-5" />
          Add member
        </Button>
      </div>

      <div className="card-soft p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-secondary text-sm uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Term</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No union members yet. Add the first one.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{m.full_name}</td>
                  <td className="px-4 py-3">{POSITION_LABEL[m.position ?? "member"] ?? m.position}</td>
                  <td className="px-4 py-3 text-sm">
                    {formatDate(m.term_start)} → {formatDate(m.term_end)}
                  </td>
                  <td className="px-4 py-3">
                    {m.is_active ? (
                      <span className="status-paid px-2.5 py-0.5 rounded-full text-xs font-semibold">
                        Active
                      </span>
                    ) : (
                      <span className="status-overdue px-2.5 py-0.5 rounded-full text-xs font-semibold">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.is_active && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setRemoveTarget(m.id)}
                        disabled={removePending}
                        aria-label="Remove member"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
                  No residents available. Residents must exist in this building first.
                </p>
              ) : (
                <select
                  id="m-profile"
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                >
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name ?? c.email ?? c.id}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="m-pos">Position</Label>
              <select
                id="m-pos"
                value={position}
                onChange={(e) => setPosition(e.target.value as UnionPosition)}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
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
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Adding…
                </>
              ) : (
                "Add member"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove this member?"
        description="They will be deactivated and their role reverted to Resident."
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
