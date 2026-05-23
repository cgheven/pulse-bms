"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, Pencil, GitBranch, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LeadFormDialog, type LeadFormValues } from "./lead-form-dialog";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  changeLeadStatus,
  deleteLead,
  type LeadStatus,
} from "@/app/actions/leads";

const STATUSES: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "demo_done", label: "Demo Done" },
  { value: "negotiating", label: "Negotiating" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "dormant", label: "Dormant" },
];

export function LeadDetailActions({
  lead,
  phone,
}: {
  lead: LeadFormValues & { id: string; status: LeadStatus };
  phone: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<LeadStatus>(lead.status);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function performDelete() {
    startTransition(async () => {
      try {
        await deleteLead(lead.id);
        toast({ title: "Lead deleted" });
        router.push("/super-admin/leads");
      } catch (err) {
        toast({
          title: "Could not delete lead",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  function performStatusChange() {
    if (newStatus === lead.status) {
      setStatusOpen(false);
      return;
    }
    startTransition(async () => {
      try {
        await changeLeadStatus(lead.id, newStatus, note || undefined);
        toast({ title: "Status updated" });
        setStatusOpen(false);
        setNote("");
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not update status",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  const cleanPhone = phone.replace(/\D/g, "");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        asChild
        variant="outline"
        className="h-11"
      >
        <a href={`tel:+${cleanPhone}`} aria-label="Call contact">
          <Phone className="w-4 h-4 mr-2" />
          Call
        </a>
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={() => setEditOpen(true)}
      >
        <Pencil className="w-4 h-4 mr-2" />
        Edit
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={() => setStatusOpen(true)}
      >
        <GitBranch className="w-4 h-4 mr-2" />
        Change status
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 text-destructive hover:text-destructive hover:border-destructive/60"
        onClick={() => setDeleteOpen(true)}
        aria-label="Delete lead"
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Delete
      </Button>

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${lead.building_name}?`}
        description="This permanently removes the lead and all its activity history. The deletion is recorded in the audit log."
        confirmLabel={isPending ? "Deleting..." : "Delete lead"}
        loading={isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={performDelete}
      />

      <LeadFormDialog
        mode="edit"
        initial={lead}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change status</DialogTitle>
            <DialogDescription>
              Move {lead.building_name} to a new stage. The timeline keeps a
              record automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-base">New status</Label>
              <Select
                value={newStatus}
                onValueChange={(v) => setNewStatus(v as LeadStatus)}
              >
                <SelectTrigger className="h-12 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status_note" className="text-base">
                Reason / note (optional)
              </Label>
              <Textarea
                id="status_note"
                rows={3}
                placeholder="Why are you moving them here?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStatusOpen(false)}
              disabled={isPending}
              className="h-11"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={performStatusChange}
              disabled={isPending}
              className="btn-big"
            >
              {isPending ? "Saving..." : "Update status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
