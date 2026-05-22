"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ExpenseForm } from "./expense-form";
import type { ExpenseInput } from "@/app/actions/expenses";

export function AddExpenseButton({ buildingId }: { buildingId?: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  // Prefill payload picked up from URL params (deep-link from Bill Accounts
  // card "Add Bill"). Once consumed we drop the params so a refresh doesn't
  // keep reopening the dialog.
  const [prefill, setPrefill] = useState<Partial<ExpenseInput> | null>(null);

  useEffect(() => {
    const billAccountId = searchParams.get("bill_account_id");
    const isBill = searchParams.get("is_bill");
    if (!billAccountId && !isBill) return;
    setPrefill({
      bill_account_id: billAccountId || null,
      is_bill: isBill === "1" || isBill === "true",
    });
    setOpen(true);
    // Strip the params after consuming so back/refresh doesn't re-trigger.
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("bill_account_id");
    sp.delete("is_bill");
    const qs = sp.toString();
    router.replace(qs ? `/admin/expenses?${qs}` : "/admin/expenses", {
      scroll: false,
    });
    // We intentionally only run this on first mount — deep-link is a one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Button
        onClick={() => {
          setPrefill(null);
          setOpen(true);
        }}
        className="shrink-0 gap-1.5"
      >
        <Plus className="w-4 h-4" />
        Add Expense
      </Button>
      <ExpenseForm
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setPrefill(null);
        }}
        buildingId={buildingId}
        prefill={prefill}
      />
    </>
  );
}
