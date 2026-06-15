"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createLevy } from "@/app/actions/levies";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Users, ArrowRight, Calendar, Repeat, Check } from "lucide-react";

interface LevyFormProps {
  activeResidentCount: number;
}

export function LevyForm({ activeResidentCount }: LevyFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [fundContribution, setFundContribution] = useState("350000");
  const [isRecurring, setIsRecurring] = useState(false);
  const [dueDate, setDueDate] = useState("");

  const total = Number(totalCost) || 0;
  const fund = Math.min(Number(fundContribution) || 0, total);
  const residentShare = Math.max(0, total - fund);
  const perResident =
    activeResidentCount > 0 && residentShare > 0
      ? residentShare / activeResidentCount
      : 0;
  const fundCoversAll = total > 0 && residentShare === 0;
  const hasMath = total > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const levy = await createLevy({
        name: name.trim(),
        description: description.trim() || null,
        total_cost: total,
        fund_contribution: Number(fundContribution) || 0,
        is_recurring: isRecurring,
        due_date: dueDate,
      });
      router.push(`/admin/levies/${levy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* ── Left: form ──────────────────────────────────── */}
        <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6 space-y-5 shadow-sm">

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="levy-name">Levy name *</Label>
            <Input
              id="levy-name"
              required
              placeholder="e.g. Water Tanker — June 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="levy-reason">
              Reason{" "}
              <span className="text-muted-foreground font-normal">(shown to residents)</span>
            </Label>
            <Textarea
              id="levy-reason"
              className="min-h-[64px] resize-none"
              placeholder="e.g. Water tanker supply for the building"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Amounts — short labels + Rs prefix keep both columns aligned */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="levy-total">Total cost *</Label>
              <CurrencyInput
                id="levy-total"
                required
                placeholder="450000"
                value={totalCost}
                onChange={setTotalCost}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="levy-fund">Fund covers</Label>
              <CurrencyInput
                id="levy-fund"
                placeholder="0"
                value={fundContribution}
                onChange={setFundContribution}
              />
            </div>
          </div>

          {/* Due date */}
          <div className="space-y-1.5">
            <Label>{isRecurring ? "First due date *" : "Due date *"}</Label>
            <DatePicker
              value={dueDate}
              onChange={setDueDate}
              placeholder="Pick a due date"
            />
          </div>

          {/* Frequency choice */}
          <div className="space-y-1.5">
            <Label>Frequency</Label>
            <div className="grid grid-cols-2 gap-3">
              <FrequencyCard
                selected={!isRecurring}
                onClick={() => setIsRecurring(false)}
                icon={<Calendar className="w-4 h-4" />}
                title="One-time"
                subtitle="Charge once"
              />
              <FrequencyCard
                selected={isRecurring}
                onClick={() => setIsRecurring(true)}
                icon={<Repeat className="w-4 h-4" />}
                title="Monthly"
                subtitle="Repeats each month"
              />
            </div>
            {isRecurring && (
              <p className="text-xs text-muted-foreground pt-1">
                A new draft is added each month for you to review and send. Turn
                it off anytime from the levies list.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={loading} className="btn-big">
              {loading ? "Saving…" : isRecurring ? "Create & Review First Month" : "Save Levy"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (name || totalCost) {
                  if (!window.confirm("Discard this levy?")) return;
                }
                router.push("/admin/levies");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>

        {/* ── Right: live summary ─────────────────────────── */}
        <div className="lg:col-span-2 lg:sticky lg:top-6">
          <div className="rounded-2xl border border-border bg-gradient-to-b from-card to-secondary/20 overflow-hidden shadow-sm">

            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold">Per-resident charge</p>
            </div>

            {/* Hero number */}
            <div className="px-5 pb-5">
              {!hasMath ? (
                <p className="text-3xl font-bold tracking-tight text-muted-foreground/40">
                  Rs. 0
                </p>
              ) : fundCoversAll ? (
                <p className="text-3xl font-bold tracking-tight text-emerald-500">
                  Rs. 0
                </p>
              ) : activeResidentCount > 0 ? (
                <p className="text-3xl font-bold tracking-tight text-primary tabular-nums">
                  {formatCurrency(perResident)}
                </p>
              ) : (
                <p className="text-xl font-bold text-destructive">No residents</p>
              )}
              <p className="text-xs text-muted-foreground mt-1.5">
                {!hasMath
                  ? "Enter a total cost to calculate"
                  : fundCoversAll
                    ? "Building fund covers the full cost"
                    : activeResidentCount > 0
                      ? `Split equally across ${activeResidentCount} residents`
                      : "Add active residents before distributing"}
              </p>
            </div>

            {/* Receipt-style math */}
            {hasMath && (
              <div className="border-t border-border bg-card/60 px-5 py-4 space-y-2.5">
                <MathRow label="Total cost" value={formatCurrency(total)} />
                <MathRow
                  label="Building fund"
                  value={`− ${formatCurrency(fund)}`}
                  valueClass="text-emerald-500"
                />
                <div className="flex items-center justify-between border-t border-border pt-2.5">
                  <span className="text-sm font-semibold">Resident share</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatCurrency(residentShare)}
                  </span>
                </div>
                {!fundCoversAll && activeResidentCount > 0 && (
                  <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
                    <span>{formatCurrency(residentShare)}</span>
                    <ArrowRight className="w-3 h-3" />
                    <span>÷ {activeResidentCount}</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="font-semibold text-primary">
                      {formatCurrency(perResident)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </form>
  );
}

/* Selectable card for the One-time / Monthly choice. */
function FrequencyCard({
  selected,
  onClick,
  icon,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`relative flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-card hover:border-primary/30"
      }`}
    >
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          selected ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-none">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </div>
      {selected && (
        <Check className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-primary" />
      )}
    </button>
  );
}

/* Currency input with a leading "Rs" adornment — keeps numeric fields aligned
   and reads as money without bloating the label. */
function CurrencyInput({
  id,
  value,
  onChange,
  placeholder,
  required,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground pointer-events-none">
        Rs
      </span>
      <Input
        id={id}
        type="number"
        min="0"
        step="1"
        required={required}
        className="pl-9 font-semibold tabular-nums"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function MathRow({
  label,
  value,
  valueClass = "text-foreground",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}
