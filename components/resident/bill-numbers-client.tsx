"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { residentUpsertUtilityAccount, type UtilityType } from "@/app/actions/utilities";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { cn } from "@/lib/utils";

type ExistingAccount = {
  id: string;
  utility_type_id: string;
  account_number: string;
  account_holder_name: string | null;
  notes: string | null;
  submitted_by_resident: boolean;
  is_verified: boolean;
};

type Props = {
  types: UtilityType[];
  existingAccounts: ExistingAccount[];
  flatNumber: string;
};

export function BillNumbersClient({ types, existingAccounts, flatNumber }: Props) {
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const [formAccountNumber, setFormAccountNumber] = useState("");
  const [formHolderName, setFormHolderName] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const accountByTypeId = new Map<string, ExistingAccount>(
    existingAccounts.map((a) => [a.utility_type_id, a]),
  );

  function openCard(typeId: string) {
    if (expandedTypeId === typeId) {
      setExpandedTypeId(null);
      return;
    }
    const existing = accountByTypeId.get(typeId);
    setFormAccountNumber(existing?.account_number ?? "");
    setFormHolderName(existing?.account_holder_name ?? "");
    setFormNotes(existing?.notes ?? "");
    setExpandedTypeId(typeId);
  }

  function handleSave(typeId: string) {
    if (!formAccountNumber.trim()) {
      toast({ title: "Account number required", description: "Enter the account number from your bill." });
      return;
    }
    startTransition(async () => {
      try {
        await residentUpsertUtilityAccount({
          utility_type_id: typeId,
          account_number: formAccountNumber.trim(),
          account_holder_name: formHolderName.trim() || null,
          notes: formNotes.trim() || null,
        });
        toast({ title: "Saved", description: "Your account number has been submitted for review." });
        setExpandedTypeId(null);
        router.refresh();
      } catch (e: unknown) {
        toast({ title: "Error", description: friendlyErrorMessage(e, "Could not save. Try again."), variant: "destructive" });
      }
    });
  }

  if (types.length === 0) {
    return (
      <div className="card-soft p-6 text-center text-sm text-muted-foreground">
        No utility types set up yet. Contact your building admin.
      </div>
    );
  }

  const addedCount = existingAccounts.length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Share your utility bill account numbers with building management. This helps them identify
        and resolve service issues before they affect you.
      </p>

      {/* Compact accordion list */}
      <div className="card-soft overflow-hidden divide-y divide-border">
        {types.map((type) => {
          const account = accountByTypeId.get(type.id);
          const isExpanded = expandedTypeId === type.id;

          return (
            <div key={type.id}>
              {/* Row */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Left: name + status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{type.name}</span>
                    {type.code && (
                      <span className="text-xs bg-secondary px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                        {type.code}
                      </span>
                    )}
                  </div>
                  {account ? (
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground">{account.account_number}</span>
                      {account.account_holder_name && (
                        <span className="text-xs text-muted-foreground">· {account.account_holder_name}</span>
                      )}
                      {account.is_verified ? (
                        <span className="status-paid text-xs">Verified</span>
                      ) : (
                        <span className="status-pending text-xs">Pending Review</span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">Not added yet</p>
                  )}
                </div>

                {/* Right: toggle button */}
                <button
                  onClick={() => openCard(type.id)}
                  className={cn(
                    "shrink-0 flex items-center gap-1 rounded-md px-3 h-8 text-xs font-medium transition-colors",
                    isExpanded
                      ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      : account
                      ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  {isExpanded ? (
                    <>Cancel <ChevronUp className="w-3 h-3" /></>
                  ) : account ? (
                    <>Update <ChevronDown className="w-3 h-3" /></>
                  ) : (
                    <>Add <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>
              </div>

              {/* Inline form — CSS animated expand */}
              <div
                className={cn(
                  "overflow-hidden transition-all duration-200 ease-in-out",
                  isExpanded ? "max-h-80" : "max-h-0",
                )}
              >
                <div className="px-4 pb-4 pt-3 bg-secondary/20 border-t border-border space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`acc-${type.id}`} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Account Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`acc-${type.id}`}
                        value={formAccountNumber}
                        onChange={(e) => setFormAccountNumber(e.target.value)}
                        placeholder="As printed on your bill"
                        className="h-9 text-sm"
                        disabled={isPending}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`holder-${type.id}`} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Account Holder <span className="text-muted-foreground font-normal normal-case">(optional)</span>
                      </Label>
                      <Input
                        id={`holder-${type.id}`}
                        value={formHolderName}
                        onChange={(e) => setFormHolderName(e.target.value)}
                        placeholder="Name on the bill"
                        className="h-9 text-sm"
                        disabled={isPending}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`notes-${type.id}`} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Notes <span className="text-muted-foreground font-normal normal-case">(optional)</span>
                    </Label>
                    <Input
                      id={`notes-${type.id}`}
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="e.g. 3-phase meter"
                      className="h-9 text-sm"
                      disabled={isPending}
                    />
                  </div>

                  <Button
                    className="h-9 text-sm w-full sm:w-auto"
                    onClick={() => handleSave(type.id)}
                    disabled={isPending}
                  >
                    {isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {addedCount > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {addedCount} of {types.length} {types.length === 1 ? "type" : "types"} added · Flat {flatNumber}
        </p>
      )}
    </div>
  );
}
