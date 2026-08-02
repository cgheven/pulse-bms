"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Ban,
  Check,
  Copy,
  Download,
  Loader2,
  RotateCcw,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ANNUAL_DISCOUNT_PCT,
  ONBOARDING_FEE,
  computeInvoiceAmounts,
  resolveTier,
  standardMonthlyRate,
} from "@/lib/client-pricing";
import type { BillingCycle, PlatformInvoice, PlatformInvoiceStatus } from "@/types";
import {
  upsertClientBilling,
  generateInvoice,
  markInvoicePaid,
  markInvoicePending,
  cancelInvoice,
  type ClientBillingInput,
} from "@/app/actions/client-billing";
import {
  invoiceStatusPill,
  isOverdue,
  pricingFlats,
  todayInputValue,
  type BillingBuildingRow,
} from "./billing-shared";

// ─── Local field helpers ─────────────────────────────────────────────────────

/** "" → null; anything unparseable → null. Note 0 is a legitimate value. */
function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {hint && <p className="text-xs text-muted-foreground/70 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Figure({
  label,
  value,
  strong,
  accent,
  strike,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: "amber" | "green" | "muted";
  strike?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={[
          "tabular-nums",
          strong ? "font-bold text-base" : "font-medium",
          accent === "amber" ? "text-primary" : "",
          accent === "green" ? "text-[hsl(151_100%_45%)]" : "",
          accent === "muted" ? "text-muted-foreground" : "",
          strike ? "line-through opacity-60" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Dialog ──────────────────────────────────────────────────────────────────

export function BuildingBillingDialog({
  row,
  open,
  onOpenChange,
}: {
  row: BillingBuildingRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const b = row.billing;

  // BILLED TO defaults to the building's own admin (bms_profiles) so these are
  // never retyped. A saved billing contact always wins — the invoice recipient
  // is sometimes a treasurer rather than the app admin, and once someone has
  // deliberately set it we must not overwrite it from the profile.
  const admin = row.admin_contact;
  const [contactName, setContactName] = useState(b?.contact_name ?? admin?.name ?? "");
  const [contactEmail, setContactEmail] = useState(b?.contact_email ?? admin?.email ?? "");
  const [contactPhone, setContactPhone] = useState(b?.contact_phone ?? admin?.phone ?? "");
  const prefilledFromAdmin =
    !b?.contact_name && !b?.contact_email && !b?.contact_phone && !!admin;
  const [cycle, setCycle] = useState<BillingCycle>(b?.billing_cycle ?? "monthly");
  const [rateOverride, setRateOverride] = useState(
    b?.monthly_rate === null || b?.monthly_rate === undefined
      ? ""
      : String(b.monthly_rate),
  );
  const [discountPct, setDiscountPct] = useState(
    String(b?.annual_discount_pct ?? ANNUAL_DISCOUNT_PCT),
  );
  const [waiveOnboarding, setWaiveOnboarding] = useState(b?.waive_onboarding ?? true);
  const [nextInvoiceDate, setNextInvoiceDate] = useState(
    b?.next_invoice_date ?? todayInputValue(),
  );
  const [notes, setNotes] = useState(b?.pricing_notes ?? "");

  const { flats, basis } = pricingFlats(row);
  const tier = resolveTier(flats);
  const standardMonthly = standardMonthlyRate(flats);
  const isFirstInvoice = row.invoices.length === 0;

  const override = parseAmount(rateOverride);
  const parsedDiscount = parseAmount(discountPct) ?? ANNUAL_DISCOUNT_PCT;

  const preview = useMemo(
    () =>
      computeInvoiceAmounts({
        flats,
        monthlyRateOverride: override,
        billingCycle: cycle,
        discountPct: parsedDiscount,
        waiveOnboarding,
        isFirstInvoice,
      }),
    [flats, override, cycle, parsedDiscount, waiveOnboarding, isFirstInvoice],
  );

  const isOverridden = override !== null && override !== standardMonthly;

  function run(fn: () => Promise<void>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function buildConfig(): ClientBillingInput {
    return {
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      billing_cycle: cycle,
      monthly_rate: override,
      annual_discount_pct: Math.min(100, Math.max(0, parsedDiscount)),
      waive_onboarding: waiveOnboarding,
      next_invoice_date: nextInvoiceDate || null,
      pricing_notes: notes.trim() || null,
    };
  }

  function handleSave() {
    run(async () => {
      await upsertClientBilling(row.id, buildConfig());
      setNotice("Billing settings saved.");
    });
  }

  function handleGenerate() {
    // Save first so an unsaved edit is never silently discarded — the button
    // is labelled "Save & Generate" to make that explicit.
    run(async () => {
      await upsertClientBilling(row.id, buildConfig());
      const result = await generateInvoice(row.id);
      setNotice(
        result.generated
          ? `Invoice ${result.invoice?.invoice_no ?? ""} generated.`.trim()
          : (result.reason ?? "No invoice was generated."),
      );
    });
  }

  function handleStatus(inv: PlatformInvoice, status: PlatformInvoiceStatus) {
    run(async () => {
      if (status === "paid") await markInvoicePaid(inv.id);
      else if (status === "cancelled") await cancelInvoice(inv.id);
      else await markInvoicePending(inv.id);
      setNotice(`${inv.invoice_no} marked ${status}.`);
    });
  }

  function invoiceUrl(token: string) {
    if (typeof window === "undefined") return `/invoice/${token}`;
    return `${window.location.origin}/invoice/${token}`;
  }

  async function copyLink(inv: PlatformInvoice) {
    try {
      await navigator.clipboard.writeText(invoiceUrl(inv.share_token));
      setCopiedId(inv.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setError("Could not copy the link. Copy it from the PDF tab instead.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{row.name}</DialogTitle>
          <DialogDescription>
            {tier.name} tier · {flats} flats{" "}
            {basis === "limit" ? "(contracted limit)" : "(live count)"} ·{" "}
            {tier.priceType === "flat"
              ? "fixed monthly fee"
              : `${formatCurrency(tier.perFlatRate ?? 0)} / flat / month`}
          </DialogDescription>
        </DialogHeader>

        {row.billing === null && row.legacy_monthly_charge !== null && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
            This building has a legacy charge of{" "}
            {formatCurrency(row.legacy_monthly_charge)}/month set on the Client
            Buildings screen. Saving here creates the real billing config, which
            supersedes it.
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {/* ── Left: the form ───────────────────────────────────────────── */}
          <div className="space-y-5">
            <Section
              title="Billed to"
              hint={
                prefilledFromAdmin
                  ? `Pre-filled from this building's ${admin?.role === "union" ? "union member" : "admin"}. Edit if the invoice should go to someone else.`
                  : "Printed in the BILLED TO block of the invoice PDF."
              }
            >
              <div className="space-y-2">
                <Input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Contact name"
                  className="h-9 text-sm"
                />
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Email"
                  className="h-9 text-sm"
                />
                <Input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Phone"
                  className="h-9 text-sm"
                />
              </div>
            </Section>

            <Section title="Plan">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Billing cycle</Label>
                  <Select
                    value={cycle}
                    onValueChange={(v) => setCycle(v as BillingCycle)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Next invoice date</Label>
                  <Input
                    type="date"
                    value={nextInvoiceDate}
                    onChange={(e) => setNextInvoiceDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Annual discount %{" "}
                  {cycle === "monthly" && (
                    <span className="text-muted-foreground/70 font-normal">
                      — applies to annual billing only
                    </span>
                  )}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                  disabled={cycle === "monthly"}
                  className="h-9 text-sm"
                />
              </div>
            </Section>

            <Section
              title="Monthly rate"
              hint="Leave blank to charge the standard tier price. Enter 0 to comp this building entirely."
            >
              <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">Standard tier price</span>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(standardMonthly)}
                    <span className="text-xs font-normal text-muted-foreground">/mo</span>
                  </span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Charge this building
                    {isOverridden && (
                      <span className="ml-1.5 text-primary font-normal">overridden</span>
                    )}
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                        Rs.
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        value={rateOverride}
                        onChange={(e) => setRateOverride(e.target.value)}
                        placeholder={String(standardMonthly)}
                        className="h-9 text-sm pl-10"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => setRateOverride("")}
                      disabled={rateOverride === ""}
                      title="Clear the override and charge the standard tier price"
                    >
                      <RotateCcw />
                      Standard
                    </Button>
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Onboarding fee">
              <label
                className={[
                  "flex items-start gap-2.5 rounded-lg border border-border p-3 cursor-pointer",
                  isFirstInvoice ? "" : "opacity-60 cursor-not-allowed",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={waiveOnboarding}
                  disabled={!isFirstInvoice}
                  onChange={(e) => setWaiveOnboarding(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[hsl(38_92%_55%)]"
                />
                <span className="text-sm">
                  Waive the {formatCurrency(ONBOARDING_FEE)} one-time onboarding fee
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {isFirstInvoice
                      ? "Only ever charged on a building's first invoice."
                      : "This building already has invoices — the onboarding fee no longer applies."}
                  </span>
                </span>
              </label>
            </Section>

            <Section title="Notes" hint="Internal only. Never printed on the invoice.">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Early adopter — discounted for the first year"
                className="text-sm min-h-0"
              />
            </Section>
          </div>

          {/* ── Right: live preview + history ────────────────────────────── */}
          <div className="space-y-5">
            <Section
              title="Next invoice preview"
              hint={`${cycle === "annual" ? "Annual" : "Monthly"} invoice, computed live as you type.`}
            >
              <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1.5">
                <Figure
                  label={`Standard price${cycle === "annual" ? " (12 mo)" : ""}`}
                  value={formatCurrency(preview.standardPrice)}
                  strike={preview.discountAmount > 0}
                />
                {preview.discountAmount > 0 && (
                  <Figure
                    label={`Subscription discount (${preview.discountPct}%)`}
                    value={`− ${formatCurrency(preview.discountAmount)}`}
                    accent="amber"
                  />
                )}
                <Figure
                  label="Subscription charged"
                  value={formatCurrency(preview.subscriptionAmount)}
                />
                <Figure
                  label="Onboarding fee"
                  value={
                    !isFirstInvoice
                      ? "Not applicable"
                      : preview.onboardingFee > 0
                        ? formatCurrency(preview.onboardingFee)
                        : "Waived"
                  }
                  accent={preview.onboardingFee > 0 ? undefined : "muted"}
                />
                <div className="border-t border-border pt-2 mt-1">
                  <Figure
                    label="Amount charged"
                    value={formatCurrency(preview.amountCharged)}
                    strong
                    accent="amber"
                  />
                </div>
                {preview.savedVsStandard > 0 && (
                  <p className="text-xs text-[hsl(151_100%_45%)] text-right">
                    {formatCurrency(preview.savedVsStandard)} saved vs. standard pricing
                  </p>
                )}
                {basis === "limit" && (
                  <p className="flex items-start gap-1.5 text-xs text-primary pt-1">
                    <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" />
                    {standardMonthly === 0
                      ? "This building has no flats and no flat limit, so the standard price is Rs. 0. Set a flat limit or import flats before invoicing."
                      : "No flats imported yet — this preview uses the contracted flat limit. A generated invoice snapshots the LIVE flat count, so it would price at Rs. 0 until flats exist. Set a monthly rate override if you need to bill now."}
                  </p>
                )}
              </div>
            </Section>

            <Section title={`Invoice history (${row.invoices.length})`}>
              {row.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-lg border border-border border-dashed p-4 text-center">
                  No invoices raised yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {row.invoices.map((inv) => {
                    const overdue = isOverdue(inv);
                    return (
                      <div
                        key={inv.id}
                        className="rounded-lg border border-border p-2.5 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {inv.period_label}
                              <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
                                {inv.invoice_no}
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Due {formatDate(inv.due_date)} ·{" "}
                              {inv.flats_count} flats ·{" "}
                              {inv.discount_pct > 0
                                ? `${inv.discount_pct}% off`
                                : "full price"}
                              {inv.onboarding_fee_charged > 0 && " · + onboarding"}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold tabular-nums">
                              {formatCurrency(Number(inv.amount))}
                            </p>
                            <span
                              className={`inline-flex mt-0.5 px-2 py-0.5 text-[10px] rounded-full ${invoiceStatusPill(inv.status, overdue)}`}
                            >
                              {inv.status === "paid"
                                ? "Paid"
                                : inv.status === "cancelled"
                                  ? "Cancelled"
                                  : overdue
                                    ? "Overdue"
                                    : "Pending"}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {inv.status !== "cancelled" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={pending}
                              onClick={() =>
                                handleStatus(
                                  inv,
                                  inv.status === "paid" ? "unpaid" : "paid",
                                )
                              }
                            >
                              <Check />
                              {inv.status === "paid" ? "Mark pending" : "Mark paid"}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() =>
                              window.open(invoiceUrl(inv.share_token), "_blank", "noopener")
                            }
                          >
                            <Download />
                            PDF
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => copyLink(inv)}
                          >
                            {copiedId === inv.id ? <Check /> : <Copy />}
                            {copiedId === inv.id ? "Copied" : "Share link"}
                          </Button>
                          {inv.status === "unpaid" && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              disabled={pending}
                              onClick={() => handleStatus(inv, "cancelled")}
                            >
                              <Ban />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive border border-destructive/40 bg-destructive/5 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {notice && !error && (
          <p className="text-sm text-[hsl(151_100%_45%)] border border-[hsl(151_100%_41%/0.3)] bg-[hsl(151_100%_41%/0.08)] rounded-lg px-3 py-2">
            {notice}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Close
          </Button>
          <Button type="button" variant="secondary" onClick={handleSave} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
          <Button type="button" onClick={handleGenerate} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Zap />}
            Save &amp; Generate Invoice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
