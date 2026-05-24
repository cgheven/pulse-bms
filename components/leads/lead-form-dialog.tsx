"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  createLead,
  updateLead,
  logActivity,
  type LeadInput,
  type LeadStatus,
  type LeadSource,
  type LeadRole,
} from "@/app/actions/leads";
import {
  WHATSAPP_TEMPLATES,
  buildWhatsappLink,
} from "@/lib/whatsapp-templates";

type Mode = "create" | "edit";

export type LeadFormValues = {
  id?: string;
  building_name: string;
  area: string;
  city: string;
  flat_count_estimate: string;
  contact_name: string;
  contact_role: LeadRole;
  whatsapp_number: string;
  email: string;
  source: LeadSource;
  status: LeadStatus;
  quoted_amount: string;
  maintenance_per_flat: string;
  notes: string;
};

const DEFAULTS: LeadFormValues = {
  building_name: "",
  area: "",
  city: "Karachi",
  flat_count_estimate: "",
  contact_name: "",
  contact_role: "president",
  whatsapp_number: "",
  email: "",
  source: "cold_visit",
  status: "new",
  quoted_amount: "",
  maintenance_per_flat: "",
  notes: "",
};

const STATUSES: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "demo_done", label: "Demo Done" },
  { value: "negotiating", label: "Negotiating" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "dormant", label: "Dormant" },
];

const SOURCES: { value: LeadSource; label: string }[] = [
  { value: "cold_visit", label: "Cold visit" },
  { value: "referral", label: "Referral" },
  { value: "whatsapp_inbound", label: "WhatsApp inbound" },
  { value: "event", label: "Event / expo" },
  { value: "website", label: "Website (onboarding form)" },
  { value: "other", label: "Other" },
];

const ROLES: { value: LeadRole; label: string }[] = [
  { value: "president", label: "President" },
  { value: "treasurer", label: "Treasurer" },
  { value: "secretary", label: "Secretary" },
  { value: "member", label: "Committee member" },
  { value: "admin", label: "Admin / Manager" },
  { value: "other", label: "Other" },
];

type JustCreated = {
  id: string;
  building_name: string;
  contact_name: string;
  whatsapp_number: string;
};

export function LeadFormDialog({
  mode,
  initial,
  open,
  onOpenChange,
  ownerName,
}: {
  mode: Mode;
  initial?: Partial<LeadFormValues>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /**
   * Display name used for the {{owner_name}} placeholder in WhatsApp
   * templates (specifically the "Send demo credentials" CTA shown
   * after a successful create). Falls back to a generic signoff if
   * not provided.
   */
  ownerName?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<LeadFormValues>({
    ...DEFAULTS,
    ...initial,
  });
  const [isPending, startTransition] = useTransition();
  // After a successful CREATE we flip into the post-create success state
  // so the user can send demo credentials in one click before closing.
  const [justCreated, setJustCreated] = useState<JustCreated | null>(null);
  // Wall-clock time the success state mounted. Any button click in the
  // first 350ms is treated as a phantom event leaking from the form's
  // submit-click (same DOM slot reuse) and ignored.
  const [successMountedAt, setSuccessMountedAt] = useState(0);

  function isClickReady() {
    return successMountedAt > 0 && Date.now() - successMountedAt > 350;
  }

  const set = <K extends keyof LeadFormValues>(k: K, v: LeadFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.building_name.trim()) {
      toast({ title: "Building name is required", variant: "destructive" });
      return;
    }
    if (!values.contact_name.trim()) {
      toast({ title: "Contact name is required", variant: "destructive" });
      return;
    }
    if (!values.whatsapp_number.trim()) {
      toast({ title: "WhatsApp number is required", variant: "destructive" });
      return;
    }

    const payload: LeadInput = {
      building_name: values.building_name,
      area: values.area || null,
      city: values.city || "Karachi",
      flat_count_estimate:
        values.flat_count_estimate === ""
          ? null
          : Number(values.flat_count_estimate),
      contact_name: values.contact_name,
      contact_role: values.contact_role,
      whatsapp_number: values.whatsapp_number,
      email: values.email || null,
      source: values.source,
      status: values.status,
      // Temperature was removed from the form UI — every new/edited
      // lead gets 'warm' so the action contract stays unchanged. If
      // we later want to drop the column entirely, change LeadInput
      // and the DB column in lockstep.
      temperature: "warm",
      // next_followup_date is intentionally NOT sent — that column is
      // derived from bms_lead_activities.followup_due_date via the
      // logFollowup action. The Edit Lead dialog no longer surfaces a
      // date input, and createLead/updateLead defensively drop the
      // field anyway so a stale client can't clobber the derived value.
      quoted_amount:
        values.quoted_amount === "" ? null : Number(values.quoted_amount),
      maintenance_per_flat:
        values.maintenance_per_flat === ""
          ? null
          : Number(values.maintenance_per_flat),
      notes: values.notes || null,
    };

    startTransition(async () => {
      try {
        if (mode === "create") {
          const created = await createLead(payload);
          toast({ title: "Lead added" });
          router.refresh();
          // Defer the success-state swap so the form's submit-click
          // event fully unwinds before the new buttons appear in the
          // same DialogFooter slot. Without the delay, the click
          // leaks onto the new buttons OR the dialog overlay and
          // ghost-closes the dialog (or ghost-fires window.open).
          setTimeout(() => {
            setJustCreated({
              id: created.id,
              building_name: created.building_name,
              contact_name: created.contact_name,
              whatsapp_number: created.whatsapp_number,
            });
            setSuccessMountedAt(Date.now());
            setValues({ ...DEFAULTS });
          }, 120);
        } else if (initial?.id) {
          await updateLead(initial.id, payload);
          toast({ title: "Lead updated" });
          onOpenChange(false);
          router.refresh();
        }
      } catch (err) {
        toast({
          title: "Could not save",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  // Reset the success-state when the dialog is fully closed so the next
  // open starts on the form, not on the success screen.
  function handleOpenChange(o: boolean) {
    onOpenChange(o);
    if (!o) {
      // small delay so the close animation doesn't show the form flash
      setTimeout(() => {
        setJustCreated(null);
        setSuccessMountedAt(0);
      }, 200);
    }
  }

  // Fires the demo-credentials WhatsApp template for the just-created
  // lead and logs an activity row so the timeline reflects it.
  function sendDemoCredentials() {
    if (!justCreated) return;
    const url = buildWhatsappLink(
      justCreated.whatsapp_number,
      "demo_credentials",
      {
        contact_name: justCreated.contact_name,
        owner_name: ownerName || "",
      },
    );
    window.open(url, "_blank", "noopener,noreferrer");
    // Best-effort activity log; if it fails we still consider the send
    // to have happened (the WhatsApp window is already open).
    logActivity(
      justCreated.id,
      "whatsapp_sent",
      `Sent template: ${WHATSAPP_TEMPLATES.demo_credentials.label}`,
      { template: "demo_credentials" },
    )
      .then(() => router.refresh())
      .catch(() => {});
  }

  // Quoted amount is meaningful from negotiating onwards. We still allow
  // it earlier — just don't surface the field until it matters.
  const showQuoted =
    values.status === "negotiating" ||
    values.status === "won" ||
    values.status === "lost";

  // Post-create success view — shown after a successful CREATE so the
  // user can ship demo credentials immediately. Keeps the dialog open
  // until they decide.
  if (justCreated) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="sm:max-w-md"
          // Lock the success dialog from auto-closing on the phantom
          // mouseup leaking from the form's submit click. User must
          // dismiss via X, Skip, or Send buttons.
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-success" />
              <DialogTitle>Lead added</DialogTitle>
            </div>
            <DialogDescription>
              {justCreated.building_name} is in the pipeline. Want to send
              the demo credentials to {justCreated.contact_name} on
              WhatsApp now?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm">
            <div className="font-medium">Message preview</div>
            <div className="text-muted-foreground mt-1 line-clamp-3 whitespace-pre-line">
              {WHATSAPP_TEMPLATES.demo_credentials.body
                .replaceAll("{{contact_name}}", justCreated.contact_name)
                .replaceAll("{{owner_name}}", ownerName || "Pulse BMS")
                .split("\n")
                .slice(0, 3)
                .join("\n")}…
            </div>
          </div>
          <DialogFooter className="pt-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!isClickReady()) return;
                handleOpenChange(false);
              }}
              className="h-11"
            >
              Skip for now
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!isClickReady()) return;
                sendDemoCredentials();
                handleOpenChange(false);
              }}
              className="btn-big bg-success hover:bg-success/90 text-white"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Send demo credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add Lead" : "Edit Lead"}
          </DialogTitle>
          <DialogDescription>
            Track a prospect society — building details, primary contact, and
            where you are in the conversation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          {/* Building info */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Society
            </h3>
            <div className="space-y-2">
              <Label htmlFor="building_name" className="text-base">
                Building Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="building_name"
                className="h-12 text-base"
                placeholder="e.g. Crescent Heights"
                value={values.building_name}
                onChange={(e) => set("building_name", e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="area" className="text-base">Area</Label>
                <Input
                  id="area"
                  className="h-12 text-base"
                  placeholder="Block / phase / sector"
                  value={values.area}
                  onChange={(e) => set("area", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city" className="text-base">City</Label>
                <Input
                  id="city"
                  className="h-12 text-base"
                  value={values.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="flat_count" className="text-base">
                  Flats (estimated)
                </Label>
                <Input
                  id="flat_count"
                  type="number"
                  min={0}
                  className="h-12 text-base"
                  placeholder="e.g. 80"
                  value={values.flat_count_estimate}
                  onChange={(e) =>
                    set("flat_count_estimate", e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maintenance_per_flat" className="text-base">
                  Maintenance / flat{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    (PKR)
                  </span>
                </Label>
                <Input
                  id="maintenance_per_flat"
                  type="number"
                  min={0}
                  step={100}
                  className="h-12 text-base"
                  placeholder="e.g. 5000"
                  value={values.maintenance_per_flat}
                  onChange={(e) =>
                    set("maintenance_per_flat", e.target.value)
                  }
                />
              </div>
            </div>
          </section>

          {/* Contact */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Primary contact
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="contact_name" className="text-base">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contact_name"
                  className="h-12 text-base"
                  value={values.contact_name}
                  onChange={(e) => set("contact_name", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-base">Role</Label>
                <Select
                  value={values.contact_role}
                  onValueChange={(v) => set("contact_role", v as LeadRole)}
                >
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="whatsapp" className="text-base">
                  WhatsApp Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="whatsapp"
                  className="h-12 text-base"
                  placeholder="0300-1234567"
                  value={values.whatsapp_number}
                  onChange={(e) => set("whatsapp_number", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-base">Email</Label>
                <Input
                  id="email"
                  type="email"
                  className="h-12 text-base"
                  placeholder="optional"
                  value={values.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Pipeline */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Pipeline
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-base">Source</Label>
                <Select
                  value={values.source}
                  onValueChange={(v) => set("source", v as LeadSource)}
                >
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-base">Status</Label>
                <Select
                  value={values.status}
                  onValueChange={(v) => set("status", v as LeadStatus)}
                >
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/*
              The "Next follow-up" date input was removed from this
              dialog. Follow-up scheduling now lives on each activity
              row (via the Log a Follow-up form on the detail page) and
              the lead's next_followup_date is derived from the latest
              activity's followup_due_date. Surfacing a manual date here
              would let a stale Save Lead click clobber that derived
              value, so the field is gone.
            */}
            {showQuoted && (
              <div className="space-y-2">
                <Label htmlFor="quoted" className="text-base">
                  Quoted amount (PKR)
                </Label>
                <Input
                  id="quoted"
                  type="number"
                  min={0}
                  className="h-12 text-base"
                  placeholder="e.g. 150000"
                  value={values.quoted_amount}
                  onChange={(e) => set("quoted_amount", e.target.value)}
                />
              </div>
            )}
          </section>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-base">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              className="text-base"
              placeholder="What did they say? Who else needs to be looped in?"
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              className="h-12 px-6 text-base"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="btn-big">
              {isPending
                ? "Saving..."
                : mode === "create"
                ? "Add Lead"
                : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddLeadButton({ ownerName }: { ownerName?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="btn-big" onClick={() => setOpen(true)}>
        + Add Lead
      </Button>
      <LeadFormDialog
        mode="create"
        open={open}
        onOpenChange={setOpen}
        ownerName={ownerName}
      />
    </>
  );
}
