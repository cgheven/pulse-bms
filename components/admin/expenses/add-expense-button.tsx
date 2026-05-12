"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ExpenseForm } from "./expense-form";

export function AddExpenseButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="btn-big">
        <Plus className="w-5 h-5 mr-2" /> Add Expense
      </Button>
      <ExpenseForm open={open} onOpenChange={setOpen} />
    </>
  );
}
