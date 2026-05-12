"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  assignComplaint,
  updateComplaintStatus,
  type ComplaintStatus,
} from "@/app/actions/facility";

type StaffOption = { id: string; full_name: string };

export function ComplaintActions({
  complaintId,
  currentStatus,
  currentAssignee,
  staff,
}: {
  complaintId: string;
  currentStatus: ComplaintStatus;
  currentAssignee: string | null;
  staff: StaffOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState("");

  const setAssignee = (id: string) => {
    start(async () => {
      try {
        await assignComplaint({
          id: complaintId,
          assigned_to: id === "none" ? null : id,
        });
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const setStatus = (status: ComplaintStatus) => {
    if (status === "resolved") {
      setResolveOpen(true);
      return;
    }
    start(async () => {
      try {
        await updateComplaintStatus({ id: complaintId, status });
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const resolve = () => {
    start(async () => {
      try {
        await updateComplaintStatus({
          id: complaintId,
          status: "resolved",
          resolution,
        });
        setResolveOpen(false);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Select
        value={currentAssignee ?? "none"}
        onValueChange={setAssignee}
        disabled={pending}
      >
        <SelectTrigger className="w-44 h-8 text-xs">
          <SelectValue placeholder="Assign..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {staff.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentStatus}
        onValueChange={(v) => setStatus(v as ComplaintStatus)}
        disabled={pending}
      >
        <SelectTrigger className="w-40 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="assigned">Assigned</SelectItem>
          <SelectItem value="in_progress">In progress</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve complaint</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="res">Resolution notes</Label>
            <Textarea
              id="res"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={4}
              placeholder="What was done?"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResolveOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={resolve} disabled={pending}>
              {pending ? "Saving..." : "Mark resolved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
