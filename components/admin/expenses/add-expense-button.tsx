"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ExpenseForm } from "./expense-form";
import type { ExpenseInput } from "@/app/actions/expenses";

export function AddExpenseButton({
  buildingId,
  mode = "expense",
}: {
  buildingId?: string | null;
  mode?: "bill" | "expense";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<Partial<ExpenseInput> | null>(null);

  useEffect(() => {
    const billAccountId = searchParams.get("bill_account_id");
    const isBill = searchParams.get("is_bill");
    if (!billAccountId && !isBill) return;

    // /admin/expenses mounts this component TWICE — once as mode="bill" and
    // once as mode="expense" — and each instance runs this effect on mount.
    // Without this gate a single deep link opens BOTH dialogs: the user sees
    // "Add expense" on top (it portals last) and "Add bill" behind it once
    // they close it. Only the instance matching the link's intent claims it.
    // A bare bill_account_id with no is_bill still means "bill".
    const wantsBill =
      isBill != null ? isBill === "1" || isBill === "true" : !!billAccountId;
    if (wantsBill !== (mode === "bill")) return;

    setPrefill({
      bill_account_id: billAccountId || null,
      is_bill: wantsBill,
    });
    setOpen(true);
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("bill_account_id");
    sp.delete("is_bill");
    const qs = sp.toString();
    router.replace(qs ? `/admin/expenses?${qs}` : "/admin/expenses", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Button
        onClick={() => { setPrefill(null); setOpen(true); }}
        variant={mode === "bill" ? "outline" : "default"}
        className="shrink-0 gap-1.5"
      >
        <Plus className="w-4 h-4" />
        {mode === "bill" ? "Add Bill" : "Add Expense"}
      </Button>
      <ExpenseForm
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setPrefill(null); }}
        buildingId={buildingId}
        prefill={prefill}
        forcedMode={mode}
      />
    </>
  );
}
