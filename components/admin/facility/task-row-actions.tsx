"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TaskForm } from "./task-form";
import {
  deleteFacilityTask,
  markTaskDone,
  type FacilityTaskInput,
} from "@/app/actions/facility";
import { Check, Pencil, Trash2 } from "lucide-react";

type StaffOption = { id: string; full_name: string };

type TaskRow = FacilityTaskInput & { id: string };

export function TaskRowActions({
  task,
  staff,
}: {
  task: TaskRow;
  staff: StaffOption[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [pending, start] = useTransition();

  const done = () => {
    start(async () => {
      try {
        await markTaskDone(task.id);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const onDelete = () => {
    start(async () => {
      try {
        await deleteFacilityTask(task.id);
        setDel(false);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <div className="flex items-center gap-1 justify-end">
      <Button
        variant="outline"
        size="sm"
        onClick={done}
        disabled={pending}
      >
        <Check className="w-4 h-4 mr-1" /> Mark Done
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setEdit(true)}>
        <Pencil className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDel(true)}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
      <TaskForm
        open={edit}
        onOpenChange={setEdit}
        task={task}
        staff={staff}
      />
      <ConfirmDialog
        open={del}
        title="Delete task?"
        confirmLabel={pending ? "Deleting..." : "Delete"}
        onCancel={() => setDel(false)}
        onConfirm={onDelete}
      />
    </div>
  );
}
