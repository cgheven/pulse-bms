"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Wallet, PiggyBank, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { updateTransparencySettings } from "@/app/actions/buildings";

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-4 cursor-pointer group">
      <div className="flex-1 flex items-start gap-3 min-w-0">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-snug">{label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        </div>
      </div>
      <div className="shrink-0 mt-1 relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 rounded-full border-2 border-border bg-secondary peer-checked:bg-primary peer-checked:border-primary transition-colors" />
        <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
      </div>
    </label>
  );
}

export function TransparencySettingsForm({
  initialShowFundBalance,
  initialShowBuildingFunds,
  initialShowDefaulters,
}: {
  initialShowFundBalance: boolean;
  initialShowBuildingFunds: boolean;
  initialShowDefaulters: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const [showFundBalance, setShowFundBalance] = useState(initialShowFundBalance);
  const [showFunds, setShowFunds] = useState(initialShowBuildingFunds);
  const [showDefaulters, setShowDefaulters] = useState(initialShowDefaulters);

  const anyOn = showFundBalance || showFunds || showDefaulters;
  const dirty =
    showFundBalance !== initialShowFundBalance ||
    showFunds !== initialShowBuildingFunds ||
    showDefaulters !== initialShowDefaulters;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        await updateTransparencySettings({
          show_fund_balance: showFundBalance,
          show_building_funds: showFunds,
          show_defaulters: showDefaulters,
        });
        toast({ title: "Transparency settings saved" });
        router.refresh();
      } catch (err) {
        const msg = friendlyErrorMessage(err, "Could not save settings");
        toast({ title: "Could not save", description: msg, variant: "destructive" });
      }
    });
  }

  return (
    <form onSubmit={submit} className="card-soft space-y-5 max-w-xl">
      <div className="flex items-center gap-2 text-xs text-muted-foreground pb-1 border-b border-border">
        {anyOn ? (
          <Eye className="w-3.5 h-3.5 text-primary" />
        ) : (
          <EyeOff className="w-3.5 h-3.5" />
        )}
        Residents only see sections you enable here. Each toggle is independent.
      </div>

      <div className="space-y-4">
        <ToggleRow
          icon={<PiggyBank className="w-5 h-5" />}
          label="Fund Balance"
          description="The total cash amount held by the building (e.g. Rs. 6,57,900). Hide this to avoid residents chasing admins for money."
          checked={showFundBalance}
          onChange={setShowFundBalance}
        />
        <ToggleRow
          icon={<Wallet className="w-5 h-5" />}
          label="Building Ledger"
          description="Monthly income, expenses, staff salaries, maintenance, and the full transaction breakdown."
          checked={showFunds}
          onChange={setShowFunds}
        />
        <ToggleRow
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Defaulters List"
          description="Flats that are 3+ months behind on maintenance dues."
          checked={showDefaulters}
          onChange={setShowDefaulters}
        />
      </div>

      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={pending || !dirty} className="btn-big">
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
