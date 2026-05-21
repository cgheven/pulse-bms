"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ExpenseForm } from "./expense-form";
import { deleteExpense } from "@/app/actions/expenses";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { Pencil, Trash2 } from "lucide-react";
import type { ExpenseCategory, ExpenseRecurrence } from "@/app/actions/expenses";

type ExpenseRow = {
  id: string;
  category: ExpenseCategory;
  subcategory: string | null;
  description: string;
  amount: number;
  expense_date: string;
  is_recurring: boolean | null;
  recurrence: ExpenseRecurrence;
  vendor: string | null;
  receipt_url: string | null;
  is_bill?: boolean | null;
  bank_account_id?: string | null;
};

export function ExpenseRowActions({
  expense,
  buildingId,
}: {
  expense: ExpenseRow;
  buildingId?: string | null;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [pending, start] = useTransition();

  const onDelete = () => {
    start(async () => {
      try {
        await deleteExpense(expense.id);
        setDel(false);
        router.refresh();
      } catch (e) {
        alert(friendlyErrorMessage(e, "Could not delete expense"));
      }
    });
  };

  return (
    <div className="flex items-center gap-1 justify-end">
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
      <ExpenseForm
        open={edit}
        onOpenChange={setEdit}
        buildingId={buildingId}
        expense={{
          id: expense.id,
          category: expense.category,
          subcategory: expense.subcategory,
          description: expense.description,
          amount: expense.amount,
          expense_date: expense.expense_date,
          is_recurring: !!expense.is_recurring,
          recurrence: expense.recurrence,
          vendor: expense.vendor,
          receipt_url: expense.receipt_url,
          is_bill: !!expense.is_bill,
          bank_account_id: expense.bank_account_id ?? null,
        }}
      />
      <ConfirmDialog
        open={del}
        title="Delete expense?"
        description="This will permanently remove the expense record."
        confirmLabel={pending ? "Deleting..." : "Delete"}
        onCancel={() => setDel(false)}
        onConfirm={onDelete}
      />
    </div>
  );
}
