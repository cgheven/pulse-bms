"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StaffForm } from "./staff-form";
import { deleteStaff } from "@/app/actions/staff";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { Eye, Pencil, Trash2 } from "lucide-react";
import type { StaffRole } from "@/types";
import { buildSlug } from "@/lib/slug";

type StaffRow = {
  id: string;
  full_name: string;
  role: StaffRole;
  phone: string | null;
  cnic: string | null;
  monthly_salary: number;
  join_date: string | null;
  exit_date: string | null;
  is_active: boolean | null;
  notes: string | null;
};

export function StaffRowActions({ staff }: { staff: StaffRow }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [pending, start] = useTransition();

  const onDelete = () => {
    start(async () => {
      try {
        await deleteStaff(staff.id);
        setDel(false);
        router.refresh();
      } catch (e) {
        alert(friendlyErrorMessage(e, "Could not delete staff"));
      }
    });
  };

  return (
    <div className="flex items-center gap-2 justify-end">
      <Link href={`/admin/staff/${buildSlug(staff.full_name, staff.id)}`}>
        <Button variant="ghost" size="sm">
          <Eye className="w-4 h-4 mr-1" /> View
        </Button>
      </Link>
      <Button variant="ghost" size="sm" onClick={() => setEdit(true)}>
        <Pencil className="w-4 h-4 mr-1" /> Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDel(true)}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
      <StaffForm open={edit} onOpenChange={setEdit} staff={staff} />
      <ConfirmDialog
        open={del}
        title="Delete staff?"
        description={`Permanently remove ${staff.full_name}. Attendance and salary records will remain.`}
        confirmLabel={pending ? "Deleting..." : "Delete"}
        onCancel={() => setDel(false)}
        onConfirm={onDelete}
      />
    </div>
  );
}
