"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TaskForm } from "./task-form";

export function AddTaskButton({
  staff,
}: {
  staff: { id: string; full_name: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="shrink-0 self-start gap-1.5">
        <Plus className="w-4 h-4" />
        New Task
      </Button>
      <TaskForm open={open} onOpenChange={setOpen} staff={staff} />
    </>
  );
}
