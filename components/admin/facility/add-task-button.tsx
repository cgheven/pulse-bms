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
      <Button onClick={() => setOpen(true)} className="btn-big">
        <Plus className="w-5 h-5 mr-2" /> New Task
      </Button>
      <TaskForm open={open} onOpenChange={setOpen} staff={staff} />
    </>
  );
}
