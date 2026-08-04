"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { recordPayment, type PaymentInput } from "@/app/actions/payments";
import { formatCurrency, formatDate, formatReceiptNo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  paymentReferenceLabel,
  paymentReferencePlaceholder,
} from "@/lib/payment-reference";
import { bankAccountLabel } from "@/lib/banks";

type BankAccountOption = {
  id: string;
  name: string;
  type: "cash" | "bank";
  bank_name: string | null;
  account_title: string | null;
  account_number: string | null;
  account_number_masked: string | null;
};

export type FlatPickerOption = {
  id: string;
  flat_number: string;
  outstanding_dues: number;
};

type PendingInv = {
  id: string;
  invoice_number: string;
  billing_month: string;
  amount: number;
  paid_total: number;
};

export type PaymentCategoryDefault = "maintenance" | "entry_fee" | "fine" | "other" | "project";

export type PresetProject = {
  id: string;
  name: string;
  /**
   * Preselects the flat picker when the dialog opens from a contributor
   * row. The matching resident auto-loads via the existing flat-change
   * effect, so the admin lands on a fully pre-filled form and just clicks
   * Save.
   */
  flat_id?: string;
  /**
   * Defaults the Amount input to (expected − paid). Pass 0 if the project
   * is voluntary or the flat has no per-flat expected amount.
   */
  amount_due?: number;
};

export function RecordPaymentDialog({
  trigger,
  flats,
  buildingName,
  buildingId,
  presetInvoice,
  presetProject,
  defaultCategory = "maintenance",
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  flats: FlatPickerOption[];
  buildingName: string;
  /**
   * Caller-provided building scope. Threaded into every client-side Supabase
   * read so RLS is backstopped by an explicit `building_id` filter — same
   * defence-in-depth pattern the server-side loaders use.
   */
  buildingId: string;
  presetInvoice?: {
    invoice_id: string;
    flat_id: string;
    flat_number: string;
    invoice_number: string;
    billing_month: string;
    amount_due: number;
    resident_id?: string | null;
    resident_name?: string | null;
  };
  /**
   * Pre-fills the dialog for a project contribution. The "Pay against"
   * dropdown shows the project as the active target (and locks it), the
   * Flat picker is left open so the recorder picks who paid, and Amount
   * defaults to `amount_due` (expected − paid) when provided.
   */
  presetProject?: PresetProject;
  /**
   * Pre-selects the "Pay against" target when the dialog opens.
   *   - "maintenance" (default): if the chosen flat has an unpaid current-month
   *     invoice → that one; else oldest open invoice; else first invoice. Falls
   *     back to "entry_fee" only if the flat has zero invoices at all.
   *   - "entry_fee" | "fine" | "other": pre-selects that category. Used by the
   *     Other Income page so admins land on the right preset.
   *
   * Note: "fine" is not currently a target option in the select (the dialog
   * only exposes entry_fee + other as non-invoice categories), so passing
   * "fine" maps to "other" until/if fine becomes a first-class target.
   */
  defaultCategory?: PaymentCategoryDefault;
  open?: boolean;
  onOpenChange?: (b: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  // Tracks whether the admin has manually picked a "Pay against" target so the
  // smart-default effect below stops stomping their choice when they change
  // flats. Reset when the dialog closes so reopening starts fresh.
  const userTouchedTarget = useRef(false);

  // For non-maintenance defaults we want the category preset visible immediately.
  // For maintenance with no preset invoice we deliberately start empty so the
  // placeholder ("Pick invoice or category") shows — the smart-default effect
  // below upgrades this to the best open invoice once invoices load. The
  // empty-string fallback avoids the surprising "Entry fee" pre-selection on
  // a fully-paid flat opened from the Maintenance page.
  const nonMaintenanceFallback: string =
    defaultCategory === "fine"
      ? "other"
      : defaultCategory === "other"
      ? "other"
      : defaultCategory === "project"
      ? "project"
      : "entry_fee";
  const initialTarget =
    presetInvoice?.invoice_id ??
    (presetProject ? "project" : null) ??
    (defaultCategory === "maintenance" ? "" : nonMaintenanceFallback);

  const [flat_id, setFlatId] = useState(
    presetInvoice?.flat_id ?? presetProject?.flat_id ?? "",
  );
  const [target, setTarget] = useState<string>(initialTarget);
  // target values:
  //   "<invoice_id>" => maintenance payment
  //   "entry_fee"   => entry fee
  //   "other"       => other
  //   "project"     => project contribution (uses presetProject)
  const [amount, setAmount] = useState<string>(
    presetInvoice
      ? String(presetInvoice.amount_due)
      : presetProject?.amount_due != null
      ? String(presetProject.amount_due)
      : "",
  );
  const [payment_date, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  // Societies collect two ways only: cash, or into a bank account.
  // "transfer"/"online"/"cheque" were folded into `bank` — see migration
  // 20260805000003, which also tightened the DB CHECK to match.
  const [payment_mode, setPaymentMode] = useState<"cash" | "bank">("cash");
  const [reference_no, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [residentId, setResidentId] = useState<string>(
    presetInvoice?.resident_id ?? "",
  );
  const [residents, setResidents] = useState<Array<{ id: string; full_name: string }>>(
    presetInvoice?.resident_id && presetInvoice?.resident_name
      ? [{ id: presetInvoice.resident_id, full_name: presetInvoice.resident_name }]
      : [],
  );
  // Bank account this payment is deposited into. Defaults to the
  // per-building "Cash" seed account once accounts load.
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  // Receipt PDF is opt-in — chowkidars recording many small chunks shouldn't
  // get a download every time. Defaults to false; admin ticks to download.
  const [downloadPdf, setDownloadPdf] = useState(false);
  const [invoices, setInvoices] = useState<PendingInv[]>(
    presetInvoice
      ? [
          {
            id: presetInvoice.invoice_id,
            invoice_number: presetInvoice.invoice_number,
            billing_month: presetInvoice.billing_month,
            amount: presetInvoice.amount_due,
            paid_total: 0,
          },
        ]
      : [],
  );

  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  // load pending invoices + residents for chosen flat
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!flat_id) {
        setInvoices(
          presetInvoice
            ? [
                {
                  id: presetInvoice.invoice_id,
                  invoice_number: presetInvoice.invoice_number,
                  billing_month: presetInvoice.billing_month,
                  amount: presetInvoice.amount_due,
                  paid_total: 0,
                },
              ]
            : [],
        );
        setResidents([]);
        setResidentId("");
        return;
      }
      const supabase = createClient();
      // All three reads are explicitly scoped by building_id — defence-in-depth
      // against any RLS regression. Mirrors the server-side loaders.
      const [invQ, resQ] = await Promise.all([
        supabase
          .from("bms_invoices")
          .select("id, invoice_number, billing_month, amount, status")
          .eq("building_id", buildingId)
          .eq("flat_id", flat_id)
          .in("status", ["pending", "partial", "overdue"])
          .order("billing_month", { ascending: true }),
        supabase
          .from("bms_residents")
          .select("id, full_name, is_primary")
          .eq("building_id", buildingId)
          .eq("flat_id", flat_id)
          .eq("is_active", true)
          .order("is_primary", { ascending: false }),
      ]);

      // paid totals per invoice
      const invIds = (invQ.data ?? []).map((i) => i.id);
      const paidMap = new Map<string, number>();
      if (invIds.length) {
        const { data: pays } = await supabase
          .from("bms_payments")
          .select("invoice_id, amount")
          .eq("building_id", buildingId)
          .in("invoice_id", invIds);
        for (const p of pays ?? []) {
          if (!p.invoice_id) continue;
          paidMap.set(p.invoice_id, (paidMap.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0));
        }
      }

      if (cancelled) return;
      const list: PendingInv[] = (invQ.data ?? []).map((i) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        billing_month: i.billing_month,
        amount: Number(i.amount),
        paid_total: paidMap.get(i.id) ?? 0,
      }));
      setInvoices(list);
      setResidents(resQ.data ?? []);
      // Always pre-select the primary resident of the chosen flat (residents
      // are ordered is_primary DESC server-side, so [0] is the primary). This
      // also clears any stale residentId from a previously selected flat that
      // wouldn't exist in the new flat's resident list.
      setResidentId(resQ.data?.[0]?.id ?? "");

      // Smart default for maintenance flow: pick the "right" invoice so the
      // chowkidar doesn't have to scroll a long list to find it.
      //   1. Unpaid current-month invoice (the typical case)
      //   2. Oldest still-open invoice (catching up on backlog)
      //   3. First invoice in the list (last resort — covers any open row)
      //   4. If zero open invoices → leave the empty placeholder alone so the
      //      admin picks deliberately (entry_fee / other / etc).
      // Skip entirely once the admin has manually touched the target select —
      // otherwise switching flats would clobber their explicit choice.
      if (
        defaultCategory === "maintenance" &&
        !presetInvoice &&
        !userTouchedTarget.current
      ) {
        const openInvs = list.filter(
          (i) => Math.max(0, i.amount - i.paid_total) > 0,
        );
        if (openInvs.length > 0) {
          const ym = new Date().toISOString().slice(0, 7);
          const currentMonth = openInvs.find((i) =>
            (i.billing_month ?? "").startsWith(ym),
          );
          const picked = currentMonth ?? openInvs[0] ?? list[0];
          if (picked) {
            setTarget(picked.id);
            setAmount(String(Math.max(0, picked.amount - picked.paid_total)));
          }
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat_id, buildingId]);

  // Reset the manual-touch flag whenever the dialog closes so a fresh open
  // starts from the smart default again (admin's intent doesn't bleed across
  // unrelated payment recording sessions).
  useEffect(() => {
    if (!open) userTouchedTarget.current = false;
  }, [open]);

  // Load active bank accounts for the building. Cash row (auto-seeded per
  // building) is selected by default — admin can switch to a real bank.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("bms_bank_accounts")
        .select(
          "id, name, type, bank_name, account_title, account_number, account_number_masked",
        )
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .order("type", { ascending: false })
        .order("name");
      if (cancelled) return;
      const rows = (data ?? []) as BankAccountOption[];
      setBankAccounts(rows);
      setBankAccountId((current) => {
        if (current) return current;
        const cash = rows.find((r) => r.type === "cash") ?? rows[0];
        return cash?.id ?? "";
      });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [buildingId]);

  // Accounts split by kind. "Paid into" only offers destinations that match
  // how the money arrived — cash in hand cannot land in an HBL account.
  const cashAccounts = useMemo(
    () => bankAccounts.filter((b) => b.type === "cash"),
    [bankAccounts],
  );
  const realBankAccounts = useMemo(
    () => bankAccounts.filter((b) => b.type === "bank"),
    [bankAccounts],
  );
  const destinations = payment_mode === "bank" ? realBankAccounts : cashAccounts;

  // A building that has not configured a bank account yet still has to be
  // able to record a bank payment — it just cannot say which account.
  const noBankConfigured = payment_mode === "bank" && realBankAccounts.length === 0;

  // Keep the destination consistent with the mode: switching Cash <-> Bank
  // must not leave the previous kind of account selected.
  useEffect(() => {
    setBankAccountId((current) => {
      if (current && destinations.some((d) => d.id === current)) return current;
      return destinations[0]?.id ?? "";
    });
  }, [payment_mode, destinations]);

  const targetIsInvoice = useMemo(
    () => target !== "entry_fee" && target !== "other" && target !== "project",
    [target],
  );
  const targetIsProject = target === "project";

  const selectedFlat = flats.find((f) => f.id === flat_id);

  // Live running totals for the selected invoice — shown above the amount
  // input so the recorder sees invoice total / already paid / still due
  // without needing to do arithmetic. Pakistani chowkidars often record
  // chunks mid-day; this keeps mistakes (paying the FULL amount when only
  // half is owed) from happening.
  const selectedInvoice = useMemo(
    () => (targetIsInvoice ? invoices.find((i) => i.id === target) : null),
    [target, targetIsInvoice, invoices],
  );
  const stillDue = selectedInvoice
    ? Math.max(0, selectedInvoice.amount - selectedInvoice.paid_total)
    : 0;
  const amountNum = Number(amount) || 0;
  const overflow =
    selectedInvoice && amountNum > stillDue ? amountNum - stillDue : 0;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flat_id) {
      toast({ title: "Pick a flat", variant: "destructive" });
      return;
    }
    if (!target) {
      toast({ title: "Pick an invoice or payment category", variant: "destructive" });
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    start(async () => {
      try {
        const payload: PaymentInput = {
          flat_id,
          invoice_id: targetIsInvoice ? target : null,
          resident_id: residentId || null,
          amount: amt,
          payment_date,
          payment_mode,
          reference_no: reference_no || null,
          category:
            target === "entry_fee"
              ? "entry_fee"
              : target === "other"
              ? "other"
              : targetIsProject
              ? "project"
              : "maintenance",
          notes:
            notes ||
            (targetIsProject && presetProject
              ? `Contribution to ${presetProject.name}`
              : null),
          bank_account_id: bankAccountId || null,
          // project_id is stamped atomically inside recordPayment now — no
          // more client-side follow-up UPDATE (which skipped the building
          // scope and silently dropped errors). Server validates cross-tenant.
          project_id: targetIsProject ? presetProject?.id ?? null : null,
        };
        const row = await recordPayment(payload);

        const receiptStr = formatReceiptNo(row.receipt_no as number | null);

        // When the admin asked for an immediate PDF, pop the printable
        // receipt page in a new tab — the page hosts Print + Download
        // buttons so we keep ONE canonical receipt layout instead of
        // shipping a separate jsPDF code path from the dialog. The browser
        // pop-up may be blocked; the success toast still links to it.
        if (downloadPdf && typeof window !== "undefined") {
          window.open(
            `/admin/payments/${row.id}/receipt`,
            "_blank",
            "noopener,noreferrer",
          );
        }

        if (row.overflow > 0) {
          toast({
            title: `${formatCurrency(row.overflow)} carried forward`,
            description: row.credit_id
              ? "Saved as credit — will apply to the next invoice."
              : "Applied to next month's invoice automatically.",
          });
        }

        // Success toast — surfaces the new monotonic receipt number AND a
        // direct link to the printable receipt page so the admin can hand
        // the resident a copy without hunting through the payments list.
        // The receipt URL opens in a new tab (target="_blank") so the
        // dialog's parent page state survives the click.
        toast({
          title: `Payment recorded · Receipt #${receiptStr || row.receipt_no}`,
          description: (
            <span>
              {downloadPdf ? "Opened receipt. " : "Saved. "}
              <a
                href={`/admin/payments/${row.id}/receipt`}
                target="_blank"
                rel="noopener"
                className="underline text-primary"
              >
                Open printable receipt
              </a>
            </span>
          ),
        });
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Error",
          description:
            friendlyErrorMessage(err, "Could not record payment"),
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Flat *</Label>
            <Select value={flat_id} onValueChange={setFlatId} disabled={!!presetInvoice}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a flat" />
              </SelectTrigger>
              <SelectContent>
                {flats.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.flat_number}
                    {f.outstanding_dues > 0
                      ? ` — dues ${formatCurrency(f.outstanding_dues)}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label>Resident</Label>
            <Select value={residentId} onValueChange={setResidentId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick resident (optional)" />
              </SelectTrigger>
              <SelectContent>
                {residents.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label>Pay against</Label>
            <Select
              value={target}
              disabled={!!presetProject}
              onValueChange={(v) => {
              userTouchedTarget.current = true;
              setTarget(v);
              if (v === "entry_fee" || v === "other") {
                // Switching to a non-invoice category — drop the previously
                // auto-filled invoice amount so the admin types the fee
                // amount fresh instead of accidentally booking the invoice
                // total against an entry fee.
                setAmount("");
              } else if (v === "project") {
                if (presetProject?.amount_due != null) {
                  setAmount(String(Math.max(0, presetProject.amount_due)));
                } else {
                  setAmount("");
                }
              } else {
                const inv = invoices.find((i) => i.id === v);
                if (inv) setAmount(String(Math.max(0, inv.amount - inv.paid_total)));
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Pick invoice or category" />
              </SelectTrigger>
              <SelectContent>
                {presetProject && (
                  <SelectItem value="project">
                    Project: {presetProject.name}
                  </SelectItem>
                )}
                {/* Billing month only. The invoice number and the outstanding
                    amount used to be appended here, but the summary box
                    directly below already shows total / paid / still due for
                    whichever invoice is selected. Safe to drop the number too:
                    bms_invoices has UNIQUE (building_id, flat_id,
                    billing_month), so a flat can never have two invoices for
                    the same month and the labels stay unambiguous. */}
                {invoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {formatDate(inv.billing_month)}
                  </SelectItem>
                ))}
                <SelectItem value="entry_fee">Entry fee</SelectItem>
                <SelectItem value="other">Other / miscellaneous</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedInvoice && (
            <div className="col-span-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice total</span>
                <span className="tabular-nums font-medium">
                  {formatCurrency(selectedInvoice.amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already paid</span>
                <span className="tabular-nums">
                  {formatCurrency(selectedInvoice.paid_total)}
                </span>
              </div>
              <div className="flex justify-between mt-1 border-t border-border pt-1">
                <span className="text-muted-foreground">Still due</span>
                <span
                  className={`tabular-nums font-semibold ${
                    stillDue > 0 ? "text-destructive" : "text-[hsl(151_70%_55%)]"
                  }`}
                >
                  {stillDue > 0 ? formatCurrency(stillDue) : "Cleared ✓"}
                </span>
              </div>
            </div>
          )}

          <div>
            <Label>Amount (PKR) *</Label>
            <Input
              type="number"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {overflow > 0 && (
              <p className="text-xs text-[hsl(151_70%_55%)] mt-1">
                {formatCurrency(overflow)} will apply to next invoice (or saved as credit).
              </p>
            )}
          </div>
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={payment_date}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          <div>
            <Label>Payment mode</Label>
            <Select
              value={payment_mode}
              onValueChange={(v) =>
                setPaymentMode(v as "cash" | "bank")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="reference_no">
              {paymentReferenceLabel(payment_mode)}
            </Label>
            <Input
              id="reference_no"
              value={reference_no}
              onChange={(e) => setRef(e.target.value)}
              placeholder={paymentReferencePlaceholder(payment_mode)}
              inputMode={payment_mode === "bank" ? "numeric" : undefined}
            />
          </div>
          <div className="col-span-2">
            <Label>
              Paid into{payment_mode === "bank" && !noBankConfigured ? " *" : ""}
            </Label>
            {noBankConfigured ? (
              // No bank account set up yet: show a disabled "Bank" so the
              // payment is still recordable, and point at where to fix it.
              <>
                <Select value="" disabled>
                  <SelectTrigger>
                    <SelectValue placeholder="Bank" />
                  </SelectTrigger>
                  <SelectContent />
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  No bank account configured.{" "}
                  <a
                    href="/admin/settings#bank-accounts"
                    className="text-primary hover:underline"
                  >
                    Add one in Settings
                  </a>{" "}
                  to record which account received the money.
                </p>
              </>
            ) : (
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      payment_mode === "bank" ? "Pick the bank account" : "Cash"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {bankAccountLabel(b)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={downloadPdf}
                onChange={(e) => setDownloadPdf(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span>Download receipt PDF after saving</span>
            </label>
          </div>

          <DialogFooter className="col-span-2 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            {/* A bank payment with no destination is the exact problem this
                screen had: "Bank" told you nothing about where the money
                went. Blocked unless the building has no bank account yet. */}
            <Button
              type="submit"
              disabled={
                pending ||
                (payment_mode === "bank" && !noBankConfigured && !bankAccountId)
              }
            >
              {pending
                ? "Saving..."
                : downloadPdf
                ? "Record & download receipt"
                : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
