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
      <Button onClick={() => setOpen(true)} className="btn-big">
        <Plus className="w-5 h-5 mr-2" /> New Notice
      </Button>
      <NoticeForm
        open={open}
        onOpenChange={setOpen}
        defaulterTemplate={defaulterTemplate}
      />
    </>
  );
}
