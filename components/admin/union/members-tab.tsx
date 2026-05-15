"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";
import { removeUnionMember } from "@/app/actions/union";

type Member = {
  id: string;
  full_name: string;
  position: string | null;
  term_start: string;
  term_end: string;
  is_active: boolean | null;
  profile_id: string;
};

const POSITION_LABEL: Record<string, string> = {
  president: "President",
  vp:        "Vice President",
  secretary: "Secretary",
  treasurer: "Treasurer",
  member:    "Member",
};

// Position-coloured pill + avatar tone — gives instant visual identity.
const POSITION_TONE: Record<string, string> = {
  president: "bg-[hsl(38_92%_55%/0.18)] text-[hsl(38_92%_70%)] border border-[hsl(38_92%_55%/0.35)]",   // amber (primary)
  vp:        "bg-[hsl(38_92%_55%/0.10)] text-[hsl(38_92%_60%)] border border-[hsl(38_92%_55%/0.20)]",   // amber-light
  treasurer: "bg-[hsl(151_70%_32%/0.15)] text-[hsl(151_70%_50%)] border border-[hsl(151_70%_32%/0.3)]", // green
  secretary: "bg-[hsl(191_100%_50%/0.12)] text-[hsl(191_100%_60%)] border border-[hsl(191_100%_50%/0.25)]", // cyan
  member:    "bg-secondary text-muted-foreground border border-border",
};

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

// Compact term format: "May 2025 – May 2027" (no day number, en-dash)
function formatTerm(start: string, end: string): { compact: string; years: number } {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) =>
    d.toLocaleString("en-PK", { month: "short", year: "numeric" });
  const years = Math.max(0, e.getFullYear() - s.getFullYear() - (e < new Date(s.getFullYear() + (e.getFullYear() - s.getFullYear()), e.getMonth(), e.getDate()) ? 0 : 0));
  return { compact: `${fmt(s)} – ${fmt(e)}`, years };
}

export function MembersTab({ members }: { members: Member[] }) {
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removePending, startRemove] = useTransition();

  function confirmRemove() {
    if (!removeTarget) return;
    startRemove(async () => {
      try {
        await removeUnionMember(removeTarget);
        toast({ title: "Union member removed" });
        setRemoveTarget(null);
      } catch (e) {
        toast({
          title: "Could not remove",
          description: e instanceof Error ? e.message : "Failed",
          variant: "destructive",
        });
      }
    });
  }

  // Inactive members feel like noise on a focused committee view — sort them
  // to the bottom and dim them visually. Active row count drives the header.
  return (
    <>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 border-b border-border">
              <tr className="text-left">
                <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Member
                </th>
                <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Position
                </th>
                <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Term
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">
                    No union members yet. Click{" "}
                    <span className="text-foreground font-medium">Add Member</span> to start —
                    adding a resident here promotes them to the Union role.
                  </td>
                </tr>
              ) : (
                members.map((m) => {
                  const pos = (m.position ?? "member") as keyof typeof POSITION_TONE;
                  const tone = POSITION_TONE[pos] ?? POSITION_TONE.member;
                  const term = formatTerm(m.term_start, m.term_end);
                  const isActive = Boolean(m.is_active);
                  return (
                    <tr
                      key={m.id}
                      className={`border-b border-border last:border-0 hover:bg-secondary/40 ${
                        isActive ? "" : "opacity-55"
                      }`}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${tone}`}
                          >
                            {initials(m.full_name)}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate leading-tight">
                              {m.full_name}
                            </div>
                            {!isActive && (
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                                Inactive
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${tone}`}
                        >
                          {POSITION_LABEL[pos] ?? m.position}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums text-xs">
                        {term.compact}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setRemoveTarget(m.id)}
                            disabled={removePending}
                            aria-label="Remove member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove this member?"
        description="They will be deactivated and their role reverted to Resident."
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  );
}
