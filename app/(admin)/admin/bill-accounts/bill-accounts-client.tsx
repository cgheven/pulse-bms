"use client";

import { useMemo, useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plug,
  Search,
  Plus,
  Pencil,
  PowerOff,
  Power,
  Receipt as ReceiptIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  getProvidersForCity,
  getQuickAddProvidersForCity,
  providerCategoryFor,
  providerLabelFor,
  type ProviderCategory,
} from "@/lib/bill-providers";
import {
  createBillAccount,
  updateBillAccount,
  setBillAccountActive,
} from "@/app/actions/bill-accounts";

export type BillAccountRow = {
  id: string;
  provider: string;
  provider_label: string | null;
  nickname: string;
  account_number: string;
  location: string | null;
  notes: string | null;
  is_active: boolean;
  last_bill_amount: number | null;
  last_bill_date: string | null;
};

const LOCATION_SUGGESTIONS = [
  "Block A",
  "Block B",
  "Lift",
  "Pump",
  "Common",
  "Generator",
  "Roof",
];

type DialogState = {
  open: boolean;
  // null = creating a new account, otherwise editing existing
  account: BillAccountRow | null;
  // Pre-selected provider key when opened via a quick-add chip. Lets the
  // dialog skip the provider Select and focus the account-number input.
  providerPreset?: string;
};

export function BillAccountsClient({
  city,
  accounts,
}: {
  city: string | null;
  accounts: BillAccountRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pendingTransition, startTransition] = useTransition();

  // Toolbar state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("__all__");
  const [activeOnly, setActiveOnly] = useState(true);

  // Debounce search 200ms to keep filtering smooth on slower devices.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const [dialog, setDialog] = useState<DialogState>({ open: false, account: null });

  // Quick-add chips — top providers for the building's city. Filter out
  // any provider the building already has 2+ accounts for so we don't
  // suggest "K-Electric" when admin already added Block A/B/Lift KE.
  const quickAddChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of accounts) {
      counts.set(a.provider, (counts.get(a.provider) ?? 0) + 1);
    }
    const all = getProvidersForCity(city);
    return getQuickAddProvidersForCity(city)
      .filter((key) => (counts.get(key) ?? 0) < 2)
      .map((key) => {
        const provider = all.find((p) => p.key === key);
        return provider ? { key, label: provider.label } : null;
      })
      .filter((x): x is { key: string; label: string } => Boolean(x));
  }, [accounts, city]);

  // Unique provider keys for the filter dropdown — derived from current
  // building's accounts so we never show options that aren't represented.
  const providerOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; label: string }[] = [];
    for (const a of accounts) {
      if (seen.has(a.provider)) continue;
      seen.add(a.provider);
      out.push({
        key: a.provider,
        label: providerLabelFor(a.provider, a.provider_label),
      });
    }
    out.sort((x, y) => x.label.localeCompare(y.label));
    return out;
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return accounts.filter((a) => {
      if (activeOnly && !a.is_active) return false;
      if (providerFilter !== "__all__" && a.provider !== providerFilter) {
        return false;
      }
      if (q) {
        const hay = [a.nickname, a.account_number, a.location ?? ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [accounts, debouncedSearch, providerFilter, activeOnly]);

  // Group cards by category for visual rhythm.
  const byCategory = useMemo(() => {
    const map = new Map<ProviderCategory, BillAccountRow[]>();
    for (const row of filtered) {
      const cat = providerCategoryFor(row.provider);
      const list = map.get(cat) ?? [];
      list.push(row);
      map.set(cat, list);
    }
    return map;
  }, [filtered]);

  const toggleActive = (row: BillAccountRow) => {
    startTransition(async () => {
      try {
        await setBillAccountActive(row.id, !row.is_active);
        toast({
          title: row.is_active
            ? `${row.nickname} deactivated`
            : `${row.nickname} reactivated`,
        });
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not update",
          description: friendlyErrorMessage(err, "Could not update bill account"),
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Toolbar — search + filters + add */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-1">
          <div className="relative sm:w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nickname, account #, location"
              className="pl-9"
            />
          </div>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="sm:w-[200px]">
              <SelectValue placeholder="All providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All providers</SelectItem>
              {providerOptions.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
            />
            Active only
          </label>
        </div>
        <Button
          onClick={() => setDialog({ open: true, account: null })}
          className="btn-big"
        >
          <Plus className="w-5 h-5 mr-1" />
          Add Account
        </Button>
      </div>

      {/* Quick-add chip row — one tap pre-fills provider in the dialog so
          admin only types account # + nickname. Hidden when 6+ accounts
          already exist (clutter; pros pick from main button). */}
      {accounts.length < 6 && quickAddChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">
            Quick add:
          </span>
          {quickAddChips.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() =>
                setDialog({ open: true, account: null, providerPreset: p.key })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card text-sm font-medium hover:border-primary hover:bg-primary/5 hover:text-primary transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {accounts.length === 0 ? (
        <div className="card-soft text-center py-12">
          <Plug className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-semibold">Add your first bill account</h3>
          <p className="text-muted-foreground mt-1 max-w-md mx-auto">
            Tap a chip above for one-click setup, or use Add Account for any
            other vendor. Bills link to these accounts automatically.
          </p>
          <Button
            onClick={() => setDialog({ open: true, account: null })}
            className="btn-big mt-5"
          >
            <Plus className="w-5 h-5 mr-1" />
            Add custom account
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-soft text-center py-10">
          <p className="text-muted-foreground">
            No bill accounts match your filters.
          </p>
        </div>
      ) : (
        // Grouped cards
        <div className="space-y-6">
          {CATEGORY_ORDER.filter((cat) => byCategory.has(cat)).map((cat) => (
            <section key={cat} className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABEL[cat]}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(byCategory.get(cat) ?? []).map((row) => (
                  <BillAccountCard
                    key={row.id}
                    row={row}
                    onEdit={() => setDialog({ open: true, account: row })}
                    onToggleActive={() => toggleActive(row)}
                    pending={pendingTransition}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <BillAccountDialog
        open={dialog.open}
        account={dialog.account}
        providerPreset={dialog.providerPreset}
        city={city}
        onOpenChange={(o) =>
          setDialog((d) => ({
            open: o,
            account: o ? d.account : null,
            providerPreset: o ? d.providerPreset : undefined,
          }))
        }
        onSaved={() => {
          setDialog({ open: false, account: null });
          router.refresh();
        }}
      />
    </div>
  );
}

function BillAccountCard({
  row,
  onEdit,
  onToggleActive,
  pending,
}: {
  row: BillAccountRow;
  onEdit: () => void;
  onToggleActive: () => void;
  pending: boolean;
}) {
  const providerLbl = providerLabelFor(row.provider, row.provider_label);

  return (
    <div
      className={cn(
        "card-soft flex flex-col gap-3 transition hover:-translate-y-0.5 hover:shadow-md",
        !row.is_active && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Nickname is the drilldown anchor — auditor clicks it to land
              on the per-account history page (24-month trend + every
              bill). We keep the rest of the card NON-link so the Edit /
              Add Bill / Deactivate buttons keep their own click handlers
              (nested anchors + buttons break a11y + lose handling). */}
          <Link
            href={`/admin/bill-accounts/${row.id}`}
            className="font-bold text-base truncate block hover:text-primary hover:underline transition-colors"
            title="View account history"
          >
            {row.nickname}
          </Link>
          <p className="text-xs text-muted-foreground truncate">
            {providerLbl} &middot; {row.account_number}
            {row.location ? ` · ${row.location}` : ""}
          </p>
        </div>
        {!row.is_active && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            Inactive
          </span>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        {row.last_bill_amount != null && row.last_bill_date ? (
          <>
            Last bill: <span className="font-semibold tabular-nums text-foreground">
              {formatCurrency(row.last_bill_amount)}
            </span>{" "}
            ({formatDate(row.last_bill_date)})
          </>
        ) : (
          <span>No recent bills</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={onEdit}
          disabled={pending}
        >
          <Pencil className="w-3.5 h-3.5 mr-1" />
          Edit
        </Button>
        <Link
          href={`/admin/expenses?bill_account_id=${row.id}&is_bill=1`}
          className="inline-flex"
        >
          <Button size="sm" variant="outline" disabled={pending}>
            <ReceiptIcon className="w-3.5 h-3.5 mr-1" />
            Add Bill
          </Button>
        </Link>
        <Button
          size="sm"
          variant="outline"
          onClick={onToggleActive}
          disabled={pending}
        >
          {row.is_active ? (
            <>
              <PowerOff className="w-3.5 h-3.5 mr-1" />
              Deactivate
            </>
          ) : (
            <>
              <Power className="w-3.5 h-3.5 mr-1" />
              Reactivate
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function BillAccountDialog({
  open,
  account,
  providerPreset,
  city,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  account: BillAccountRow | null;
  providerPreset?: string;
  city: string | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state — reset whenever the dialog opens or the target account changes.
  const [provider, setProvider] = useState<string>("");
  const [providerLabel, setProviderLabel] = useState<string>("");
  const [nickname, setNickname] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Ref on the account-number input so quick-add chips auto-focus it after
  // pre-filling provider — admin's cursor lands where they need to type
  // the only field a chip can't auto-fill.
  const accountNumberRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setProvider(account?.provider ?? providerPreset ?? "");
    setProviderLabel(account?.provider_label ?? "");
    setNickname(account?.nickname ?? "");
    setAccountNumber(account?.account_number ?? "");
    setLocation(account?.location ?? "");
    setNotes(account?.notes ?? "");
    // If a quick-add chip pre-filled the provider, jump the cursor to the
    // account-number input on the next tick (after the dialog mounts).
    if (providerPreset && !account) {
      setTimeout(() => accountNumberRef.current?.focus(), 50);
    }
  }, [open, account, providerPreset]);

  // City-scoped providers + "Other" fallback. Group by category for the UX.
  const providers = useMemo(() => getProvidersForCity(city), [city]);
  const providersByCat = useMemo(() => {
    const map = new Map<ProviderCategory, typeof providers>();
    for (const p of providers) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return map;
  }, [providers]);

  const isOther = provider === "other";

  const submit = () => {
    setError(null);
    // Client validation mirrors the action — friendlier feedback.
    if (!provider) {
      setError("Pick a provider.");
      return;
    }
    if (isOther && !providerLabel.trim()) {
      setError("Custom provider name is required.");
      return;
    }
    if (!nickname.trim()) {
      setError("Nickname is required.");
      return;
    }
    if (!accountNumber.trim()) {
      setError("Account number is required.");
      return;
    }

    start(async () => {
      try {
        const payload = {
          provider,
          provider_label: isOther ? providerLabel.trim() : null,
          nickname: nickname.trim(),
          account_number: accountNumber.trim(),
          location: location.trim() || null,
          notes: notes.trim() || null,
        };
        if (account) {
          await updateBillAccount(account.id, payload);
          toast({ title: "Bill account updated" });
        } else {
          await createBillAccount(payload);
          toast({ title: "Bill account added" });
        }
        onSaved();
      } catch (err) {
        const msg = friendlyErrorMessage(err, "Could not save bill account");
        setError(msg);
        toast({
          title: "Could not save",
          description: msg,
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {account ? "Edit bill account" : "Add bill account"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a provider" />
              </SelectTrigger>
              <SelectContent>
                {Array.from(providersByCat.entries()).map(([cat, list]) => (
                  <SelectGroup key={cat}>
                    <SelectLabel>{CATEGORY_LABEL[cat]}</SelectLabel>
                    {list.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {!city && (
              <p className="text-xs text-muted-foreground mt-1">
                No city set for this building. Only the Other (custom)
                option is shown. Set your city in Settings &gt; Building
                Info to see local providers.
              </p>
            )}
          </div>

          {isOther && (
            <div>
              <Label htmlFor="ba-custom">Custom provider name</Label>
              <Input
                id="ba-custom"
                value={providerLabel}
                onChange={(e) => setProviderLabel(e.target.value)}
                placeholder="e.g. WAPDA Hyderabad"
              />
            </div>
          )}

          <div>
            <Label htmlFor="ba-nick">Nickname</Label>
            <Input
              id="ba-nick"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Block A KE"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Short name shown on the cards + expense picker.
            </p>
          </div>

          <div>
            <Label htmlFor="ba-acc">Account number</Label>
            <Input
              id="ba-acc"
              ref={accountNumberRef}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="KE-4400-12345-6"
            />
          </div>

          <div>
            <Label htmlFor="ba-loc">Location</Label>
            <Input
              id="ba-loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Block A / Lift / Common"
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {LOCATION_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setLocation(s)}
                  className="text-xs px-2 py-1 rounded-full border border-input hover:bg-muted transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="ba-notes">Notes (optional)</Label>
            <Textarea
              id="ba-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 10 MBps shared connection"
              rows={2}
            />
          </div>

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
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
          <Button onClick={submit} disabled={pending} className="btn-big">
            {pending ? "Saving..." : account ? "Save changes" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
