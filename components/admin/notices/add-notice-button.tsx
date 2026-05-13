"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { NoticeForm } from "./notice-form";

export function AddNoticeButton({
  defaulterTemplate,
}: {
  defaulterTemplate?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="shrink-0 self-start gap-1.5">
        <Plus className="w-4 h-4" />
        New Notice
      </Button>
      <NoticeForm
        open={open}
        onOpenChange={setOpen}
        defaulterTemplate={defaulterTemplate}
      />
    </>
  );
}
