"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
import { cn } from "@/lib/utils";
import { TRADES, TRADE_KEYS, getTrade, type ServiceContact } from "@/lib/trade-contacts";
import { upsertServiceContact } from "@/app/actions/service-contacts";

type Form = {
  name: string;
  trade: string;
  phone: string;
  whatsapp: string;
  is_available: boolean;
  notes: string;
};

const EMPTY: Form = {
  name: "",
  trade: "electrician",
  phone: "",
  whatsapp: "",
  is_available: true,
  notes: "",
};

interface ContactFormDialogProps {
  open: boolean;
  onClose: () => void;
  contact?: ServiceContact | null;
  defaultTrade?: string;
}

export function ContactFormDialog({ open, onClose, contact, defaultTrade }: ContactFormDialogProps) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setError("");
      setForm(
        contact
          ? {
              name: contact.name,
              trade: contact.trade,
              phone: contact.phone,
              whatsapp: contact.whatsapp ?? "",
              is_available: contact.is_available,
              notes: contact.notes ?? "",
            }
          : { ...EMPTY, trade: defaultTrade ?? EMPTY.trade },
      );
    }
  }, [open, contact, defaultTrade]);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        await upsertServiceContact({
          id: contact?.id,
          name: form.name,
          trade: form.trade,
          phone: form.phone,
          whatsapp: form.whatsapp || null,
          is_available: form.is_available,
          notes: form.notes || null,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  const isValid = form.name.trim().length >= 2 && form.phone.trim().length >= 7;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {contact
              ? "Edit Contact"
              : defaultTrade && TRADES[defaultTrade as keyof typeof TRADES]
                ? `Add ${TRADES[defaultTrade as keyof typeof TRADES].label}`
                : "Add Service Contact"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="sc-name">Full Name *</Label>
            <Input
              id="sc-name"
              placeholder="e.g. Muhammad Arif"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>

          {/* Trade badge — shown when opened from a template so admin sees which trade is selected */}
          {defaultTrade && !contact && (() => {
            const trade = getTrade(defaultTrade);
            return (
              <div className={cn("flex items-center gap-2.5 px-3 py-2.5 rounded-xl border", trade.colorBorder, trade.colorBg)}>
                <span className={cn("text-sm font-semibold", trade.colorText)}>Trade:</span>
                <span className={cn("text-sm font-bold", trade.colorText)}>{trade.label}</span>
              </div>
            );
          })()}

          {/* Trade dropdown — shown only when NOT opened from a template, or in edit mode */}
          {!defaultTrade || contact ? (
            <div className="space-y-1.5">
              <Label>Trade / Specialty *</Label>
              <Select value={form.trade} onValueChange={(v) => set("trade", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRADE_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {TRADES[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="sc-phone">Phone Number *</Label>
            <Input
              id="sc-phone"
              type="tel"
              placeholder="0300-1234567"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              required
            />
          </div>

          {/* WhatsApp */}
          <div className="space-y-1.5">
            <Label htmlFor="sc-whatsapp">
              WhatsApp Number{" "}
              <span className="text-muted-foreground font-normal">(if different from phone)</span>
            </Label>
            <Input
              id="sc-whatsapp"
              type="tel"
              placeholder="Leave blank to use same number"
              value={form.whatsapp}
              onChange={(e) => set("whatsapp", e.target.value)}
            />
          </div>

          {/* Availability toggle */}
          <div className="flex items-center gap-3 py-1">
            <button
              type="button"
              role="switch"
              aria-checked={form.is_available}
              onClick={() => set("is_available", !form.is_available)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                form.is_available ? "bg-success" : "bg-muted-foreground/40"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  form.is_available ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <Label className="cursor-default">
              {form.is_available ? "Currently available" : "Currently unavailable"}
            </Label>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="sc-notes">
              Notes{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="sc-notes"
              placeholder='e.g. "Available 9am – 6pm, no Sundays"'
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !isValid}>
              {pending ? "Saving…" : contact ? "Save Changes" : "Add Contact"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
