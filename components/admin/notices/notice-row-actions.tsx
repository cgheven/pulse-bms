"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NoticeForm } from "./notice-form";
import { deleteNotice, type NoticeInput } from "@/app/actions/notices";
import { Pencil, Trash2 } from "lucide-react";

type NoticeRow = NoticeInput & { id: string };

export function NoticeRowActions({
  notice,
  defaulterTemplate,
}: {
  notice: NoticeRow;
  defaulterTemplate?: string;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [pending, start] = useTransition();

  const onDelete = () => {
    start(async () => {
      try {
        await deleteNotice(notice.id);
        setDel(false);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => setEdit(true)}>
        <Pencil className="w-4 h-4 mr-1" /> Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDel(true)}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="w-4 h-4 mr-1" /> Delete
      </Button>
      <NoticeForm
        open={edit}
        onOpenChange={setEdit}
        notice={notice}
        defaulterTemplate={defaulterTemplate}
      />
      <ConfirmDialog
        open={del}
        title="Delete notice?"
        confirmLabel={pending ? "Deleting..." : "Delete"}
        onCancel={() => setDel(false)}
        onConfirm={onDelete}
      />
    </div>
  );
}
