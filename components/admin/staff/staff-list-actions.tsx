"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, UserCheck } from "lucide-react";
import { StaffForm } from "./staff-form";
import { markAllPresentToday } from "@/app/actions/staff";

export function StaffListActions() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const markAll = () => {
    setMsg(null);
    start(async () => {
      try {
        const { count } = await markAllPresentToday();
        setMsg(`Marked ${count} active staff present for today.`);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={markAll}
          disabled={pending}
          className="h-12"
        >
          <UserCheck className="w-5 h-5 mr-2" />
          {pending ? "Marking..." : "Mark Present All (Today)"}
        </Button>
        <Button onClick={() => setOpen(true)} className="btn-big">
          <Plus className="w-5 h-5 mr-2" />
          Add Staff
        </Button>
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <StaffForm open={open} onOpenChange={setOpen} />
    </div>
  );
}
