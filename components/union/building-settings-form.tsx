"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Building2, EyeOff, Eye, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  updateBuildingSettings,
  type BuildingSettingsInput,
} from "@/app/actions/union";
import { cn } from "@/lib/utils";

type Values = BuildingSettingsInput;

export function BuildingSettingsForm({
  buildingName,
  initial,
}: {
  buildingName: string;
  initial: Values;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<Values>(initial);
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof Values>(k: K, v: Values[K]) =>
    setValues((p) => ({ ...p, [k]: v }));

  const dirty =
    values.entry_fee_owner !== initial.entry_fee_owner ||
    values.entry_fee_tenant !== initial.entry_fee_tenant ||
    values.monthly_fee_default !== initial.monthly_fee_default ||
    values.utility_cutoff_after_months !== initial.utility_cutoff_after_months ||
    values.voting_rule !== initial.voting_rule ||
    values.expose_defaulter_names !== initial.expose_defaulter_names ||
    values.listing_enabled !== initial.listing_enabled ||
    (values.public_whatsapp ?? "") !== (initial.public_whatsapp ?? "") ||
    values.invoice_due_day !== initial.invoice_due_day;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateBuildingSettings({
          entry_fee_owner: Number(values.entry_fee_owner) || 0,
          entry_fee_tenant: Number(values.entry_fee_tenant) || 0,
          monthly_fee_default: Number(values.monthly_fee_default) || 0,
          utility_cutoff_after_months:
            Number(values.utility_cutoff_after_months) || 1,
          invoice_due_day: Number(values.invoice_due_day),
          voting_rule: values.voting_rule,
          expose_defaulter_names: Boolean(values.expose_defaulter_names),
          listing_enabled: Boolean(values.listing_enabled),
          public_whatsapp: (values.public_whatsapp ?? "").trim(),
        });
        toast({ title: "Settings saved" });
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not save",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="card-soft">
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-border">
          <Building2 className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold tracking-tight">
            {buildingName}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Maintenance Fee"
            hint="Charged to every flat each month unless overridden per-flat."
          >
            <CurrencyInput
              id="monthly_fee_default"
              value={values.monthly_fee_default}
              onChange={(v) => set("monthly_fee_default", v)}
            />
          </Field>

          <Field
            label="Utility Cut-off"
            hint="Flag a flat as defaulter after this many months unpaid."
          >
            <Input
              id="utility_cutoff_after_months"
              type="number"
              min={1}
              max={24}
              className="h-11 text-base"
              value={values.utility_cutoff_after_months}
              onChange={(e) =>
                set("utility_cutoff_after_months", Number(e.target.value))
              }
            />
          </Field>

          <Field
            label="Invoice Due Day"
            hint="Day of the billing month by which maintenance must be paid (1–28)."
          >
            <Input
              id="invoice_due_day"
              type="number"
              min={1}
              max={28}
              className="h-11 text-base"
              value={values.invoice_due_day}
              onChange={(e) =>
                set("invoice_due_day", Number(e.target.value))
              }
            />
          </Field>

          <Field
            label="Entry Fee · Flat Purchase"
            hint="One-time charge when a new owner moves in."
          >
            <CurrencyInput
              id="entry_fee_owner"
              value={values.entry_fee_owner}
              onChange={(v) => set("entry_fee_owner", v)}
            />
          </Field>

          <Field
            label="Entry Fee · Rent"
            hint="One-time charge when a new tenant moves in."
          >
            <CurrencyInput
              id="entry_fee_tenant"
              value={values.entry_fee_tenant}
              onChange={(v) => set("entry_fee_tenant", v)}
            />
          </Field>

          <Field
            label="Voting Rule"
            hint="How proposals pass — majority of cast votes or every member."
          >
            <Select
              value={values.voting_rule}
              onValueChange={(v) =>
                set("voting_rule", v as "majority" | "unanimous")
              }
            >
              <SelectTrigger className="h-11 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="majority">
                  Majority — more than half
                </SelectItem>
                <SelectItem value="unanimous">
                  Unanimous — everyone agrees
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

        </div>
      </div>

      <div className="card-soft">
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-border">
          <EyeOff className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold tracking-tight">
            Resident transparency
          </h2>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Label className="text-sm font-medium">
              Show defaulter names to residents
            </Label>
            <p className="text-xs text-muted-foreground leading-snug mt-1.5">
              {values.expose_defaulter_names
                ? "Residents will see the full name of each defaulter alongside flat number on the Transparency page."
                : "Residents will only see flat numbers (e.g. “Flat A-101 · 3 months unpaid”). Names stay private."}
            </p>
          </div>
          <Toggle
            checked={values.expose_defaulter_names}
            onChange={(v) => set("expose_defaulter_names", v)}
            labelOn="Names visible"
            labelOff="Names hidden"
          />
        </div>
      </div>

      {/* Public listings */}
      <div className="card-soft">
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-border">
          <Globe className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold tracking-tight">
            Public listings · /find
          </h2>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Label className="text-sm font-medium">
              List this building on the public marketplace
            </Label>
            <p className="text-xs text-muted-foreground leading-snug mt-1.5">
              {values.listing_enabled
                ? "Your building appears on /find. Flat owners can publish rent/sale listings that route leads to your WhatsApp."
                : "Hidden from /find. Owners can still mark flats but nothing is public until you switch this on."}
            </p>
          </div>
          <Toggle
            checked={values.listing_enabled}
            onChange={(v) => set("listing_enabled", v)}
            labelOn="Listed"
            labelOff="Hidden"
          />
        </div>

        <div className="mt-4">
          <Label className="text-sm font-medium">
            Union WhatsApp number{values.listing_enabled ? " *" : ""}
          </Label>
          <Input
            inputMode="tel"
            placeholder="0331-1000006"
            value={values.public_whatsapp ?? ""}
            onChange={(e) => set("public_whatsapp", e.target.value)}
            className="h-11 text-base"
          />
          <p className="text-xs text-muted-foreground leading-snug mt-1.5">
            Rental and buyer leads from /find open WhatsApp pre-filled to this number.
            Union committee picks up the conversation and closes the deal.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setValues(initial)}
          disabled={!dirty || isPending}
        >
          Reset
        </Button>
        <Button type="submit" disabled={!dirty || isPending} className="btn-big">
          <Save className="w-4 h-4" />
          {isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && (
        <p className="text-xs text-muted-foreground leading-snug">{hint}</p>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  labelOn,
  labelOff,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelOn: string;
  labelOff: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2.5 shrink-0"
    >
      <span
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
          checked
            ? "bg-primary border-primary"
            : "bg-secondary border-border",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </span>
      <span
        className={cn(
          "text-xs font-medium uppercase tracking-wider transition-colors",
          checked ? "text-primary" : "text-muted-foreground",
        )}
      >
        {checked ? labelOn : labelOff}
      </span>
    </button>
  );
}

function CurrencyInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
        Rs.
      </span>
      <Input
        id={id}
        type="number"
        min={0}
        className="h-11 text-base pl-10 tabular-nums"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
