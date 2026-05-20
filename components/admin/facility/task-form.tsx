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
  createFacilityTask,
  updateFacilityTask,
  type FacilityTaskInput,
  type TaskRecurrence,
} from "@/app/actions/facility";
import { friendlyErrorMessage } from "@/lib/toast-error";

type StaffOption = { id: string; full_name: string };

export function TaskForm({
  open,
  onOpenChange,
  task,
  staff,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task?: (FacilityTaskInput & { id: string }) | null;
  staff: StaffOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FacilityTaskInput>({
    title: task?.title ?? "",
    description: task?.description ?? "",
    task_type: task?.task_type ?? "scheduled",
    category: task?.category ?? "",
    recurrence: (task?.recurrence as TaskRecurrence) ?? "monthly",
    next_due_date:
      task?.next_due_date ?? new Date().toISOString().split("T")[0],
    assigned_to: task?.assigned_to ?? null,
    status: task?.status ?? "pending",
  });

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        if (task?.id) {
          await updateFacilityTask(task.id, form);
        } else {
          await createFacilityTask(form);
        }
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        setError(friendlyErrorMessage(e, "Could not save task"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New facility task"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label htmlFor="t">Title</Label>
            <Input
              id="t"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Lift service inspection"
            />
          </div>

          <div>
            <Label>Type</Label>
            <Select
              value={form.task_type}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  task_type: v as "scheduled" | "one_off",
                  recurrence: v === "one_off" ? null : form.recurrence,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Scheduled (recurring)</SelectItem>
                <SelectItem value="one_off">One-off</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="cat">Category</Label>
            <Input
              id="cat"
              value={form.category ?? ""}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="lift, generator, plumbing..."
            />
          </div>

          {form.task_type === "scheduled" && (
            <div>
              <Label>Recurrence</Label>
              <Select
                value={form.recurrence ?? "monthly"}
                onValueChange={(v) =>
                  setForm({ ...form, recurrence: v as TaskRecurrence })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="due">Next due date</Label>
            <Input
              id="due"
              type="date"
              value={form.next_due_date ?? ""}
              onChange={(e) =>
                setForm({ ...form, next_due_date: e.target.value })
              }
            />
          </div>

          <div className="sm:col-span-2">
            <Label>Assigned to (staff)</Label>
            <Select
              value={form.assigned_to ?? "none"}
              onValueChange={(v) =>
                setForm({ ...form, assigned_to: v === "none" ? null : v })
              }
            >
              <SelectTrigger>
                <SelectValue />
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
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="d">Description</Label>
            <Textarea
              id="d"
              value={form.description ?? ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={3}
            />
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
          <Button onClick={submit} disabled={pending || !form.title.trim()}>
            {pending ? "Saving..." : task ? "Save" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
