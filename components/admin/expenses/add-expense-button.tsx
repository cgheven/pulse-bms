"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ExpenseForm } from "./expense-form";

export function AddExpenseButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="shrink-0 gap-1.5">
        <Plus className="w-4 h-4" />
        Add Expense
      </Button>
      <ExpenseForm open={open} onOpenChange={setOpen} />
    </>
  );
}
