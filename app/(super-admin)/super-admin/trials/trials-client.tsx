"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Building2,
  Check,
  Lock,
  Share2,
  FlaskConical,
  Zap,
  AlertCircle,
  Rocket,
  MoreHorizontal,
  CalendarPlus,
  MessageCircle,
  PowerOff,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  createTrialBuilding,
  createProductionBuilding,
  extendTrial,
  deactivateTrialBuilding,
  convertToProduction,
  updateBuildingCharge,
} from "@/app/actions/trials";
import { TRIAL_DURATION_DAYS, type TrialDurationDays } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type TrialCred = { login_email: string; login_password: string } | null;

export type LeadForImport = {
  id: string;
  building_name: string;
  city: string | null;
  flat_count_estimate: number | null;
  contact_name: string;
  whatsapp_number: string;
  email: string | null;
  quoted_amount: number | null;
  status: string;
};

type BuildingRow = {
  id: string;
  name: string;
  city: string | null;
  is_active: boolean;
  is_trial: boolean;
  trial_ends_at: string | null;
  trial_duration_days: number | null;
  flat_limit: number;
  pulse_monthly_charge: number | null;
  created_at: string;
  bms_trial_credentials: TrialCred[] | null;
};

type Props = {
  trials: BuildingRow[];
  userRole: string;
  leads: LeadForImport[];
};

type NewCredentials = {
  building_id: string;
  building_name: string;
  whatsapp_number: string | null;
  email: string;
  password: string;
  trial_ends_at: string | null;
  is_trial: boolean;
};

type BuildingType = "trial" | "production";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Pricing helpers ──────────────────────────────────────────────────────────

type PriceTier = { name: string; calc: number; label: string };

function calcPulseFee(flatLimit: number): PriceTier {
  const n = Math.max(1, Math.round(flatLimit));
  if (n <= 100) return { name: "Starter", calc: 15000, label: "Fixed monthly fee (up to 100 flats)" };
  if (n <= 400) return { name: "Growth", calc: n * 100, label: `Rs. 100 × ${n} flats` };
  return { name: "Pro", calc: n * 50, label: `Rs. 50 × ${n} flats` };
}

function formatPKR(amount: number): string {
  return "Rs. " + Math.round(amount).toLocaleString("en-PK");
}

function PricingSection({
  flatLimit,
  charge,
  onChargeChange,
}: {
  flatLimit: string;
  charge: string;
  onChargeChange: (v: string) => void;
}) {
  const limit = Number(flatLimit) || 0;
  const tier = limit > 0 ? calcPulseFee(limit) : null;
  const calcAmount = tier ? String(Math.round(tier.calc)) : "";

  // When flat limit changes (after mount), reset charge to the new calculated amount.
  // Skipping mount so EditFeeDialog preserves an existing stored charge.
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current && calcAmount) {
      onChargeChange(calcAmount);
    }
    mounted.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatLimit]);

  const isDiscounted = charge !== "" && calcAmount !== "" && Number(charge) < Number(calcAmount);

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">Monthly Pulse BMS Fee</p>
      <div className="grid grid-cols-2 gap-4">
        {/* Calculated */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Standard Rate</p>
          {tier ? (
            <>
              <p className="text-base font-bold tabular-nums text-foreground">
                {formatPKR(tier.calc)}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <p className="text-xs text-muted-foreground">{tier.name} · {tier.label}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Enter flat limit first</p>
          )}
        </div>
        {/* Charged */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Charged to Client
            {isDiscounted && <span className="ml-1 text-amber-600 normal-case">(discounted)</span>}
          </p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">Rs.</span>
            <Input
              type="number"
              min={0}
              value={charge}
              onChange={(e) => onChargeChange(e.target.value)}
              className="h-10 text-sm pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">Lower this to give a discount</p>
        </div>
      </div>
    </div>
  );
}

function getDaysRemaining(trial_ends_at: string | null): number | null {
  if (!trial_ends_at) return null;
  const expiryMs = Date.parse(trial_ends_at);
  if (isNaN(expiryMs)) return null;
  return Math.ceil((expiryMs - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function normalizeWhatsApp(raw: string): string {
  let num = raw.replace(/[\s\-().+]/g, "");
  if (num.startsWith("0")) num = "92" + num.slice(1);
  return num;
}

function shareOnWhatsApp(
  buildingName: string,
  email: string,
  password: string,
  trialEndsAt: string | null,
  isTrial: boolean,
  whatsappNumber?: string | null,
) {
  const expiryLine = isTrial && trialEndsAt
    ? `📅 Trial Expires: ${formatDate(trialEndsAt)}\n`
    : "";
  const message =
    `Hi! Here are your Pulse BMS credentials:\n\n` +
    `🏢 Building: ${buildingName}\n` +
    `📧 Login Email: ${email}\n` +
    `🔑 Password: ${password}\n` +
    expiryLine +
    `\nLogin at your Pulse BMS portal to get started.`;
  const number = whatsappNumber ? normalizeWhatsApp(whatsappNumber) : "";
  const url = number
    ? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text, label = "value" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? "Copied" : `Copy ${label}`}
      title={copied ? "Copied" : `Copy ${label}`}
      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ row }: { row: BuildingRow }) {
  if (!row.is_active) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        Deactivated
      </span>
    );
  }
  if (!row.is_trial) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <Zap className="w-3 h-3" /> Live
      </span>
    );
  }
  const days = getDaysRemaining(row.trial_ends_at);
  if (days === null || days <= 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <Lock className="w-3 h-3" /> Expired
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      <Clock className="w-3 h-3" /> {days}d trial
    </span>
  );
}

// ─── Password cell ────────────────────────────────────────────────────────────

function PasswordCell({ password }: { password: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-sm">{visible ? password : "••••••••••"}</span>
      <button
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
      >
        {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <CopyButton text={password} label="password" />
    </div>
  );
}

// ─── Create dialog ────────────────────────────────────────────────────────────

function CreateDialog({
  open,
  onClose,
  onSuccess,
  leads,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (creds: NewCredentials) => void;
  leads: LeadForImport[];
}) {
  const [buildingType, setBuildingType] = useState<BuildingType>("trial");
  const [buildingName, setBuildingName] = useState("");
  const [city, setCity] = useState("Karachi");
  const [flatLimit, setFlatLimit] = useState("99");
  const [monthlyCharge, setMonthlyCharge] = useState(() => String(calcPulseFee(99).calc));
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [duration, setDuration] = useState<TrialDurationDays>(7);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Prevents PricingSection's flatLimit-change effect from overwriting a
  // quoted_amount we just imported from a lead.
  const suppressChargeRecalc = useRef(false);

  function resetForm() {
    setBuildingType("trial");
    setBuildingName("");
    setCity("Karachi");
    setFlatLimit("99");
    setMonthlyCharge(String(calcPulseFee(99).calc));
    setContactName("");
    setContactEmail("");
    setWhatsappNumber("");
    setDuration(7);
    setSelectedLeadId("");
    suppressChargeRecalc.current = false;
    setError(null);
  }

  function handleLeadSelect(leadId: string) {
    setSelectedLeadId(leadId);
    if (!leadId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    setBuildingName(lead.building_name);
    if (lead.city) setCity(lead.city);
    if (lead.flat_count_estimate && lead.flat_count_estimate >= 1) {
      setFlatLimit(String(Math.min(9999, Math.round(lead.flat_count_estimate))));
    }
    setContactName(lead.contact_name);
    setWhatsappNumber(lead.whatsapp_number);
    const derivedEmail = lead.email ?? (() => {
      const parts = lead.contact_name.trim().split(/\s+/).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean);
      if (!parts.length) return null;
      const local = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
      return `${local}@yourpulse.io`;
    })();
    if (derivedEmail) setContactEmail(derivedEmail);
    if (lead.quoted_amount && lead.quoted_amount > 0) {
      suppressChargeRecalc.current = true;
      setMonthlyCharge(String(Math.round(lead.quoted_amount)));
    }
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit() {
    setError(null);
    const limit = Number(flatLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 9999) {
      setError("Flat limit must be a whole number between 1 and 9999.");
      return;
    }

    startTransition(async () => {
      try {
        let result: { building_id: string; email: string; password: string; trial_ends_at: string | null };

        if (buildingType === "trial") {
          result = await createTrialBuilding({
            building_name: buildingName,
            city,
            flat_limit: limit,
            duration_days: duration,
            contact_name: contactName || null,
            contact_email: contactEmail || null,
          });
        } else {
          result = await createProductionBuilding({
            building_name: buildingName,
            city,
            flat_limit: limit,
            pulse_monthly_charge: monthlyCharge ? Number(monthlyCharge) : null,
            admin_name: contactName,
            admin_email: contactEmail,
          });
        }

        const snapshotName = buildingName;
        const snapshotWa = whatsappNumber;
        resetForm();
        onSuccess({
          ...result,
          building_name: snapshotName,
          whatsapp_number: snapshotWa || null,
          is_trial: buildingType === "trial",
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "An error occurred.");
      }
    });
  }

  const emailRequired = buildingType === "production";
  const nameRequired = buildingType === "production";
  const flatLimitValid = Number.isInteger(Number(flatLimit)) && Number(flatLimit) >= 1 && Number(flatLimit) <= 9999;
  const canSubmit =
    buildingName.trim() &&
    flatLimitValid &&
    (!nameRequired || contactName.trim()) &&
    (!emailRequired || contactEmail.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Building2 className="w-5 h-5 text-primary" />
            Create Building
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* Fill from lead */}
          {leads.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="lead-import" className="text-base">Fill from Lead</Label>
              <select
                id="lead-import"
                value={selectedLeadId}
                onChange={(e) => handleLeadSelect(e.target.value)}
                className="w-full h-12 rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— Select a lead to auto-fill —</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.building_name}
                    {l.flat_count_estimate ? ` · ${l.flat_count_estimate} flats` : ""}
                    {l.city ? ` · ${l.city}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Auto-fills building name, contact, WhatsApp, flat count, and quoted amount. You can edit any field after.
              </p>
            </div>
          )}

          {/* Building type toggle */}
          <div className="space-y-1.5">
            <Label className="text-base">Building Type</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setBuildingType("trial")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  buildingType === "trial"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                <FlaskConical className="w-4 h-4" />
                Trial / Demo
              </button>
              <button
                type="button"
                onClick={() => setBuildingType("production")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  buildingType === "production"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                <Zap className="w-4 h-4" />
                Production (Live)
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {buildingType === "trial"
                ? "Temporary access with an expiry date. Credentials auto-generated."
                : "Full live building. Admin can start managing immediately."}
            </p>
          </div>

          {/* Building name */}
          <div className="space-y-1.5">
            <Label htmlFor="building-name" className="text-base">Building / Society Name *</Label>
            <Input
              id="building-name"
              value={buildingName}
              onChange={(e) => setBuildingName(e.target.value)}
              placeholder="e.g. Green Heights Society"
              className="h-12 text-base"
            />
          </div>

          {/* Flat limit + city — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="flat-limit" className="text-base">Flat Limit *</Label>
              <Input
                id="flat-limit"
                type="number"
                min={1}
                max={9999}
                value={flatLimit}
                onChange={(e) => setFlatLimit(e.target.value)}
                placeholder="99"
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city" className="text-base">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Karachi"
                className="h-12 text-base"
              />
            </div>
          </div>

          {/* Admin / Contact name */}
          <div className="space-y-1.5">
            <Label htmlFor="contact-name" className="text-base">
              Admin / Contact Name{nameRequired ? " *" : ""}
              {!nameRequired && (
                <span className="text-muted-foreground text-sm font-normal"> (optional)</span>
              )}
            </Label>
            <Input
              id="contact-name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Ahmed Khan"
              className="h-12 text-base"
            />
          </div>

          {/* Admin email */}
          <div className="space-y-1.5">
            <Label htmlFor="contact-email" className="text-base">
              Admin Email{emailRequired ? " *" : ""}
              {!emailRequired && (
                <span className="text-muted-foreground text-sm font-normal"> (auto-generated if blank)</span>
              )}
            </Label>
            <Input
              id="contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="e.g. ahmed@greenheights.pk"
              className="h-12 text-base"
            />
          </div>

          {/* WhatsApp */}
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp" className="text-base">
              WhatsApp Number
              <span className="text-muted-foreground text-sm font-normal"> (to share credentials)</span>
            </Label>
            <Input
              id="whatsapp"
              type="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="e.g. 03001234567"
              className="h-12 text-base"
            />
          </div>

          {/* Pricing — only for production buildings */}
          {buildingType === "production" && (
            <PricingSection
              flatLimit={flatLimit}
              charge={monthlyCharge}
              onChargeChange={(v) => {
                if (suppressChargeRecalc.current) {
                  suppressChargeRecalc.current = false;
                  return;
                }
                setMonthlyCharge(v);
              }}
            />
          )}

          {/* Trial duration — only for trial type */}
          {buildingType === "trial" && (
            <div className="space-y-2">
              <Label className="text-base">Trial Duration</Label>
              <div className="flex gap-3">
                {TRIAL_DURATION_DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`flex-1 py-3 rounded-lg border-2 text-base font-medium transition-colors ${
                      duration === d
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {d} Days
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending} className="h-12">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !canSubmit}
            className="btn-big h-12 px-6"
          >
            {isPending ? "Creating…" : "Create Building"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Credentials reveal dialog ────────────────────────────────────────────────

function CredentialsDialog({
  creds,
  onClose,
}: {
  creds: NewCredentials | null;
  onClose: () => void;
}) {
  const router = useRouter();
  if (!creds) return null;

  function handleDone() {
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={!!creds} onOpenChange={(v) => !v && handleDone()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-green-700">
            <Check className="w-5 h-5" />
            Building Created
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Login Email</Label>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 border">
                <span className="font-mono text-sm flex-1 break-all">{creds.email}</span>
                <CopyButton text={creds.email} label="email" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Password</Label>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 border">
                <span className="font-mono text-base font-semibold flex-1">{creds.password}</span>
                <CopyButton text={creds.password} label="password" />
              </div>
            </div>

            {creds.is_trial && creds.trial_ends_at && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Trial expires: <strong className="text-foreground">{formatDate(creds.trial_ends_at)}</strong></span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="h-12 px-5 text-green-700 border-green-300 hover:bg-green-50 hover:border-green-400 gap-2"
            onClick={() =>
              shareOnWhatsApp(
                creds.building_name,
                creds.email,
                creds.password,
                creds.trial_ends_at,
                creds.is_trial,
                creds.whatsapp_number,
              )
            }
          >
            <Share2 className="w-4 h-4" />
            Share via WhatsApp
          </Button>
          <Button onClick={handleDone} className="btn-big h-12 px-8">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Extend dialog ────────────────────────────────────────────────────────────

function ExtendDialog({
  buildingId,
  buildingName,
  open,
  onClose,
}: {
  buildingId: string;
  buildingName: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [days, setDays] = useState<TrialDurationDays>(7);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleExtend() {
    setError(null);
    startTransition(async () => {
      try {
        await extendTrial(buildingId, days);
        onClose();
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to extend trial.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="text-lg">Extend Trial</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Extend trial for <strong>{buildingName}</strong> by:
          </p>
          <div className="flex gap-3">
            {TRIAL_DURATION_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`flex-1 py-3 rounded-lg border-2 text-base font-medium transition-colors ${
                  days === d
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                +{d} Days
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleExtend} disabled={isPending} className="h-11">
            {isPending ? "Extending…" : "Extend Trial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Convert to production dialog ────────────────────────────────────────────

type ConvertResult = { building_name: string; email: string | null; password: string | null };

function ConvertDialog({
  building,
  open,
  onClose,
}: {
  building: { id: string; name: string; flat_limit: number; pulse_monthly_charge: number | null } | null;
  open: boolean;
  onClose: (result?: ConvertResult) => void;
}) {
  const router = useRouter();
  const [flatLimit, setFlatLimit] = useState(() =>
    building ? String(building.flat_limit) : "",
  );
  const [monthlyCharge, setMonthlyCharge] = useState(() => {
    if (building?.pulse_monthly_charge) return String(building.pulse_monthly_charge);
    return building ? String(calcPulseFee(building.flat_limit).calc) : "";
  });
  const [resetPassword, setResetPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Keep state in sync if a different building is targeted before the dialog closes
  const [prevBuildingId, setPrevBuildingId] = useState(building?.id);
  if (building?.id !== prevBuildingId) {
    setPrevBuildingId(building?.id);
    setFlatLimit(building ? String(building.flat_limit) : "");
    setMonthlyCharge(
      building?.pulse_monthly_charge
        ? String(building.pulse_monthly_charge)
        : building ? String(calcPulseFee(building.flat_limit).calc) : "",
    );
  }

  if (!building) return null;

  function handleOpen() {
    setFlatLimit(String(building!.flat_limit));
    setMonthlyCharge(
      building!.pulse_monthly_charge
        ? String(building!.pulse_monthly_charge)
        : String(calcPulseFee(building!.flat_limit).calc),
    );
    setResetPassword(false);
    setError(null);
  }

  function handleClose() {
    setError(null);
    onClose();
  }

  function handleConvert() {
    setError(null);
    const limit = Number(flatLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 9999) {
      setError("Flat limit must be a whole number between 1 and 9999.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await convertToProduction(building!.id, {
          flat_limit: limit,
          pulse_monthly_charge: monthlyCharge ? Number(monthlyCharge) : null,
          reset_password: resetPassword,
        });
        onClose(result);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Conversion failed.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else handleOpen(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Rocket className="w-5 h-5 text-primary" />
            Go Live — {building.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            This removes the trial period and all editing restrictions. The admin&apos;s existing login stays active.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="convert-flat-limit" className="text-base">
              Flat Limit *
              <span className="text-muted-foreground text-sm font-normal ml-1">(maximum flats the admin can create)</span>
            </Label>
            <Input
              id="convert-flat-limit"
              type="number"
              min={1}
              max={9999}
              value={flatLimit}
              onChange={(e) => setFlatLimit(e.target.value)}
              className="h-12 text-base"
            />
          </div>

          <PricingSection
            flatLimit={flatLimit}
            charge={monthlyCharge}
            onChargeChange={setMonthlyCharge}
          />

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={resetPassword}
              onChange={(e) => setResetPassword(e.target.checked)}
              className="mt-1 w-4 h-4 accent-primary"
            />
            <div>
              <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                Reset admin password
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generates a new secure password. Share it with the client — the old trial password will no longer work.
              </p>
            </div>
          </label>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending} className="h-12">
            Cancel
          </Button>
          <Button
            onClick={handleConvert}
            disabled={isPending}
            className="h-12 px-6 bg-green-600 hover:bg-green-700 text-white"
          >
            {isPending ? "Converting…" : "Go Live"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Post-conversion credentials dialog ───────────────────────────────────────

function ConvertSuccessDialog({
  result,
  onClose,
}: {
  result: ConvertResult | null;
  onClose: () => void;
}) {
  if (!result) return null;

  return (
    <Dialog open={!!result} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-green-700">
            <Rocket className="w-5 h-5" />
            {result.building_name} is now Live
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Trial restrictions have been removed. The building is fully active.
          </p>

          {result.password ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>New password set. Share it with the client now — it won&apos;t be stored.</span>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Login Email</Label>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 border">
                  <span className="font-mono text-sm flex-1 break-all">{result.email}</span>
                  <CopyButton text={result.email ?? ""} label="email" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">New Password</Label>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 border">
                  <span className="font-mono text-base font-semibold flex-1">{result.password}</span>
                  <CopyButton text={result.password} label="password" />
                </div>
              </div>
              {result.email && (
                <Button
                  variant="outline"
                  className="w-full h-11 text-green-700 border-green-300 hover:bg-green-50 gap-2"
                  onClick={() => {
                    const msg =
                      `Hi! Your Pulse BMS building is now live.\n\n` +
                      `🏢 Building: ${result.building_name}\n` +
                      `📧 Login: ${result.email}\n` +
                      `🔑 New Password: ${result.password}\n\n` +
                      `Please log in and change your password from account settings.`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
                  }}
                >
                  <Share2 className="w-4 h-4" />
                  Share via WhatsApp
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The admin can continue using their existing login credentials.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="btn-big h-12 px-8">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Fee dialog ──────────────────────────────────────────────────────────

function EditFeeDialog({
  building,
  open,
  onClose,
}: {
  building: { id: string; name: string; flat_limit: number; pulse_monthly_charge: number | null } | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [charge, setCharge] = useState(() =>
    building?.pulse_monthly_charge ? String(building.pulse_monthly_charge) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [prevId, setPrevId] = useState(building?.id);
  if (building?.id !== prevId) {
    setPrevId(building?.id);
    setCharge(building?.pulse_monthly_charge ? String(building.pulse_monthly_charge) : "");
  }

  if (!building) return null;

  function handleSave() {
    setError(null);
    const amount = charge ? Number(charge) : null;
    if (charge && (isNaN(Number(charge)) || Number(charge) < 0)) {
      setError("Please enter a valid amount.");
      return;
    }
    startTransition(async () => {
      try {
        await updateBuildingCharge(building!.id, amount);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Edit Monthly Fee — {building.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <PricingSection
            flatLimit={String(building.flat_limit)}
            charge={charge}
            onChargeChange={setCharge}
          />
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending} className="h-12">Cancel</Button>
          <Button onClick={handleSave} disabled={isPending} className="h-12 px-6">
            {isPending ? "Saving…" : "Save Fee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function TrialsClient({ trials, userRole, leads }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [newCreds, setNewCreds] = useState<NewCredentials | null>(null);
  const [extendTarget, setExtendTarget] = useState<{ id: string; name: string } | null>(null);
  const [convertTarget, setConvertTarget] = useState<{ id: string; name: string; flat_limit: number; pulse_monthly_charge: number | null } | null>(null);
  const [convertResult, setConvertResult] = useState<ConvertResult | null>(null);
  const [editFeeTarget, setEditFeeTarget] = useState<{ id: string; name: string; flat_limit: number; pulse_monthly_charge: number | null } | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const now = Date.now();
  const production = trials.filter((t) => !t.is_trial);
  const activeTrials = trials.filter(
    (t) => t.is_trial && t.is_active && t.trial_ends_at && Date.parse(t.trial_ends_at) > now,
  );
  const expiredTrials = trials.filter(
    (t) => t.is_trial && (!t.is_active || (t.trial_ends_at && Date.parse(t.trial_ends_at) <= now)),
  );

  function handleDeactivate(building_id: string) {
    setDeactivatingId(building_id);
    startTransition(async () => {
      try {
        await deactivateTrialBuilding(building_id);
        router.refresh();
      } catch {
        // stale state — user can refresh
      } finally {
        setDeactivatingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            Buildings
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create and manage trial and production buildings for clients.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="btn-big h-14 px-6 text-base"
        >
          <Plus className="w-5 h-5 mr-2" />
          Create Building
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total",          value: trials.length,        color: "text-foreground" },
          { label: "Production",     value: production.length,    color: "text-blue-700" },
          { label: "Active Trials",  value: activeTrials.length,  color: "text-green-700" },
          { label: "Expired Trials", value: expiredTrials.length, color: "text-red-700" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border rounded-xl p-4">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {trials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border rounded-xl bg-card">
          <Building2 className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold text-foreground">No buildings created yet</h3>
          <p className="text-muted-foreground mt-1 text-sm max-w-xs">
            Create a trial or production building for your clients.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="mt-6 h-12 px-6">
            <Plus className="w-4 h-4 mr-2" />
            Create Building
          </Button>
        </div>
      ) : (
        <div className="border rounded-xl overflow-x-auto bg-card">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-secondary/30">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Building</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Flat Limit</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Monthly Fee</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Trial Expiry</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Login</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {trials.map((row) => {
                const cred = row.bms_trial_credentials?.[0] ?? null;
                return (
                  <tr key={row.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">{row.name}</p>
                          {row.city && (
                            <p className="text-xs text-muted-foreground">{row.city}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.is_trial ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <FlaskConical className="w-3 h-3" /> Trial
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          <Zap className="w-3 h-3" /> Production
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge row={row} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">
                      {row.flat_limit}
                    </td>
                    <td className="px-4 py-3">
                      {row.pulse_monthly_charge != null ? (
                        <button
                          className="text-left hover:underline"
                          onClick={() => setEditFeeTarget({ id: row.id, name: row.name, flat_limit: row.flat_limit, pulse_monthly_charge: row.pulse_monthly_charge })}
                          title="Click to edit"
                        >
                          <span className="font-medium tabular-nums">{formatPKR(row.pulse_monthly_charge)}</span>
                          <span className="text-xs text-muted-foreground">/mo</span>
                        </button>
                      ) : (
                        <button
                          className="text-xs text-primary hover:underline"
                          onClick={() => setEditFeeTarget({ id: row.id, name: row.name, flat_limit: row.flat_limit, pulse_monthly_charge: row.pulse_monthly_charge })}
                        >
                          + Set fee
                        </button>
                      )}
                    </td>
                    {/* Trial expiry — only meaningful for trial rows */}
                    <td className="px-4 py-3 text-muted-foreground text-sm">
                      {row.is_trial ? formatDate(row.trial_ends_at) : (
                        <span className="text-xs text-muted-foreground/50">No expiry</span>
                      )}
                    </td>

                    {/* Login credentials — trials only */}
                    <td className="px-4 py-3">
                      {cred ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs">{cred.login_email}</span>
                            <CopyButton text={cred.login_email} label="email" />
                          </div>
                          <PasswordCell password={cred.login_password} />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">Admin manages login</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* Primary CTA */}
                        {row.is_trial ? (
                          <Button
                            size="sm"
                            className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
                            onClick={() => setConvertTarget({ id: row.id, name: row.name, flat_limit: row.flat_limit, pulse_monthly_charge: row.pulse_monthly_charge })}
                          >
                            <Rocket className="w-3.5 h-3.5" />
                            Go Live
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs gap-1.5"
                            onClick={() => setEditFeeTarget({ id: row.id, name: row.name, flat_limit: row.flat_limit, pulse_monthly_charge: row.pulse_monthly_charge })}
                          >
                            <Pencil className="w-3 h-3" />
                            Edit Fee
                          </Button>
                        )}

                        {/* Secondary actions — overflow menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                              aria-label="More actions"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {cred && (
                              <DropdownMenuItem
                                onClick={() =>
                                  shareOnWhatsApp(
                                    row.name,
                                    cred.login_email,
                                    cred.login_password,
                                    row.trial_ends_at,
                                    row.is_trial,
                                  )
                                }
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                Send credentials
                              </DropdownMenuItem>
                            )}
                            {row.is_trial && (
                              <DropdownMenuItem
                                onClick={() => setExtendTarget({ id: row.id, name: row.name })}
                              >
                                <CalendarPlus className="w-3.5 h-3.5" />
                                Extend trial
                              </DropdownMenuItem>
                            )}
                            {row.is_trial && row.is_active && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  destructive
                                  disabled={deactivatingId === row.id}
                                  onClick={() => handleDeactivate(row.id)}
                                >
                                  <PowerOff className="w-3.5 h-3.5" />
                                  {deactivatingId === row.id ? "Deactivating…" : "Deactivate"}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={(creds) => {
          setCreateOpen(false);
          setNewCreds(creds);
        }}
        leads={leads}
      />

      <CredentialsDialog
        creds={newCreds}
        onClose={() => setNewCreds(null)}
      />

      {extendTarget && (
        <ExtendDialog
          buildingId={extendTarget.id}
          buildingName={extendTarget.name}
          open={!!extendTarget}
          onClose={() => setExtendTarget(null)}
        />
      )}

      <ConvertDialog
        building={convertTarget}
        open={!!convertTarget}
        onClose={(result) => {
          setConvertTarget(null);
          if (result) setConvertResult(result);
        }}
      />

      <ConvertSuccessDialog
        result={convertResult}
        onClose={() => setConvertResult(null)}
      />

      <EditFeeDialog
        building={editFeeTarget}
        open={!!editFeeTarget}
        onClose={() => setEditFeeTarget(null)}
      />
    </div>
  );
}
