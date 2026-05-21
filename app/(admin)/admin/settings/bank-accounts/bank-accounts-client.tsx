"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  createBankAccount,
  updateBankAccount,
  deactivateBankAccount,
  type BankAccountInput,
} from "@/app/actions/bank-accounts";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { formatCurrency, formatDate } from "@/lib/utils";

type AccountRow = {
  id: string;
  name: string;
  type: "cash" | "bank";
  account_number_masked: string | null;
  opening_balance: number;
  opening_balance_date: string;
  is_active: boolean;
  created_at: string;
};

export function BankAccountsClient({
  accounts,
}: {
  accounts: AccountRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [deactivating, setDeactivating] = useState<AccountRow | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Add bank or cash account
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b border-border">
              <tr className="text-left">
                <th className="px-3 py-3 font-semibold">Name</th>
                <th className="px-3 py-3 font-semibold">Type</th>
                <th className="px-3 py-3 font-semibold">Account # (last 4)</th>
                <th className="px-3 py-3 font-semibold text-right">Opening</th>
                <th className="px-3 py-3 font-semibold">As of</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-10 text-center text-muted-foreground"
                  >
                    No bank accounts yet. The default Cash account should
                    have been seeded automatically — click Add to create one.
                  </td>
                </tr>
              )}
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-border last:border-0 hover:bg-secondary/40"
                >
                  <td className="px-3 py-3 font-medium">{a.name}</td>
                  <td className="px-3 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-secondary border border-border">
                      {a.type === "cash" ? "Cash" : "Bank"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground font-mono text-xs">
                    {a.account_number_masked ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatCurrency(a.opening_balance)}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                    {formatDate(a.opening_balance_date)}
                  </td>
                  <td className="px-3 py-3">
                    {a.is_active ? (
                      <span className="text-[hsl(151_70%_35%)] text-xs font-semibold">
                        Active
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(a)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {a.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeactivating(a)}
                        >
                          <Power className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <BankAccountForm
        open={adding}
        onOpenChange={setAdding}
      />

      {editing && (
        <BankAccountForm
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          account={editing}
        />
      )}

      {deactivating && (
        <DeactivateConfirm
          account={deactivating}
          onClose={() => setDeactivating(null)}
        />
      )}
    </div>
  );
}

function BankAccountForm({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account?: AccountRow;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<BankAccountInput>({
    name: account?.name ?? "",
    type: account?.type ?? "bank",
    account_number_masked: account?.account_number_masked ?? "",
    opening_balance: account?.opening_balance ?? 0,
    opening_balance_date:
      account?.opening_balance_date ?? new Date().toISOString().slice(0, 10),
    is_active: account?.is_active ?? true,
  });

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        if (account) {
          await updateBankAccount(account.id, form);
        } else {
          await createBankAccount(form);
        }
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        setError(friendlyErrorMessage(e, "Could not save bank account"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {account ? "Edit account" : "Add bank or cash account"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="HBL Main, Meezan Reserve, Cash"
            />
          </div>

          <div>
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) =>
                setForm({ ...form, type: v as "cash" | "bank" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="acct">Account # (last 4 only)</Label>
            <Input
              id="acct"
              maxLength={4}
              value={form.account_number_masked ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  account_number_masked: e.target.value.replace(/\D/g, ""),
                })
              }
              placeholder="1234"
            />
          </div>

          <div>
            <Label htmlFor="bal">Opening balance (Rs.)</Label>
            <Input
              id="bal"
              type="number"
              value={form.opening_balance}
              onChange={(e) =>
                setForm({
                  ...form,
                  opening_balance: Number(e.target.value) || 0,
                })
              }
            />
          </div>

          <div>
            <Label htmlFor="bdate">As of</Label>
            <Input
              id="bdate"
              type="date"
              value={form.opening_balance_date}
              onChange={(e) =>
                setForm({ ...form, opening_balance_date: e.target.value })
              }
            />
          </div>

          {account && (
            <div className="col-span-2 flex items-center gap-2">
              <input
                id="active"
                type="checkbox"
                className="h-5 w-5"
                checked={!!form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
              />
              <Label htmlFor="active">Active</Label>
            </div>
          )}

          {error && (
            <div className="col-span-2">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !form.name.trim()}
          >
            {pending ? "Saving..." : account ? "Save" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateConfirm({
  account,
  onClose,
}: {
  account: AccountRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const onConfirm = () => {
    start(async () => {
      try {
        await deactivateBankAccount(account.id);
        onClose();
        router.refresh();
      } catch (e) {
        alert(friendlyErrorMessage(e, "Could not deactivate account"));
      }
    });
  };

  return (
    <ConfirmDialog
      open
      title={`Deactivate ${account.name}?`}
      description="The account will be hidden from future payments and expenses. Historical movements stay attached to it for accurate reports."
      confirmLabel={pending ? "Deactivating..." : "Deactivate"}
      onCancel={onClose}
      onConfirm={onConfirm}
    />
  );
}
