"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, UserCheck, Loader2 } from "lucide-react";
import { StaffForm } from "./staff-form";
import { markAllPresentToday } from "@/app/actions/staff";
import { useToast } from "@/hooks/use-toast";

export function StaffListActions() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const markAll = () => {
    start(async () => {
      try {
        const { count } = await markAllPresentToday();
        toast({ title: `Marked ${count} staff present for today.` });
        router.refresh();
      } catch (e) {
        toast({
          title: "Could not mark attendance",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={markAll}
        disabled={pending}
        className="gap-1.5"
        title="Mark every active staff as present for today"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
        <span className="hidden sm:inline">Mark all present</span>
        <span className="sm:hidden">All present</span>
      </Button>
      <Button onClick={() => setOpen(true)} className="shrink-0 gap-1.5">
        <Plus className="w-4 h-4" />
        Add Staff
      </Button>
      <StaffForm open={open} onOpenChange={setOpen} />
    </div>
  );
}
