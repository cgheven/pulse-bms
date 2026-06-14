"use client";

import { useEffect, useRef, useState } from "react";
import {
  Zap, Droplets, Hammer, Paintbrush, Gauge, ArrowUpDown,
  Bug, SprayCan, ShieldCheck, Wind, Layers, Wrench,
  Phone, MessageCircle, Pencil, Trash2, Copy, Check,
} from "lucide-react";
import { cn, formatPhone } from "@/lib/utils";
import { getTrade, type ServiceContact } from "@/lib/trade-contacts";

const TRADE_ICONS: Record<string, React.ElementType> = {
  electrician:    Zap,
  plumber:        Droplets,
  carpenter:      Hammer,
  painter:        Paintbrush,
  generator_tech: Gauge,
  lift_tech:      ArrowUpDown,
  pest_control:   Bug,
  cleaner:        SprayCan,
  security:       ShieldCheck,
  hvac:           Wind,
  mason:          Layers,
  other:          Wrench,
};

function toWhatsAppNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return "92" + digits.slice(1);
  return digits;
}

interface ContactCardProps {
  contact: ServiceContact;
  isAdmin?: boolean;
  onEdit?: (contact: ServiceContact) => void;
  onDelete?: (id: string) => void;
}

export function ContactCard({ contact, isAdmin, onEdit, onDelete }: ContactCardProps) {
  const trade = getTrade(contact.trade);
  const Icon = TRADE_ICONS[contact.trade] ?? Wrench;
  const waHref = `https://wa.me/${toWhatsAppNumber(contact.whatsapp ?? contact.phone)}`;
  const [copied, setCopied] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const timerPhone = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timerWa = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => {
    clearTimeout(timerPhone.current);
    clearTimeout(timerWa.current);
  }, []);

  function copyPhone() {
    navigator.clipboard.writeText(contact.phone).then(() => {
      setCopied(true);
      clearTimeout(timerPhone.current);
      timerPhone.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyWhatsApp() {
    const number = contact.whatsapp ?? contact.phone;
    navigator.clipboard.writeText(number).then(() => {
      setCopiedWa(true);
      clearTimeout(timerWa.current);
      timerWa.current = setTimeout(() => setCopiedWa(false), 2000);
    });
  }

  return (
    <div className="flex h-full rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
      {/* Left colored accent bar */}
      <div className={cn("w-1 shrink-0", trade.topBar)} />

      <div className="flex-1 p-4 flex flex-col gap-3 min-w-0">

        {/* ── Row 1: icon + name + availability ── */}
        <div className="flex items-center gap-3">
          {/* Trade icon */}
          <div className={cn(
            "w-10 h-10 rounded-lg shrink-0 flex items-center justify-center",
            trade.colorBg,
          )}>
            <Icon className={cn("w-5 h-5", trade.colorText)} />
          </div>

          {/* Name + trade + status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-foreground text-base leading-none truncate">
                {contact.name}
              </p>
              <div className={cn(
                "shrink-0 flex items-center gap-1 text-[11px] font-medium",
                contact.is_available ? "text-emerald-600" : "text-muted-foreground",
              )}>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  contact.is_available ? "bg-emerald-500" : "bg-muted-foreground/50",
                )} />
                {contact.is_available ? "Available" : "Unavailable"}
              </div>
            </div>
            <span className={cn(
              "inline-block mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold",
              trade.colorBg, trade.colorText,
            )}>
              {trade.label}
            </span>
          </div>
        </div>

        {/* ── Row 2: phone number ── */}
        <div className="flex items-center gap-2">
          <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold text-foreground">
            {formatPhone(contact.phone)}
          </span>
        </div>

        {/* ── Row 3: notes (optional) ── */}
        {contact.notes && (
          <p className="text-xs text-muted-foreground leading-relaxed -mt-1">
            {contact.notes}
          </p>
        )}

        {/* ── Row 4: action buttons — mt-auto keeps them pinned to the bottom ── */}
        <div className="flex items-center gap-2 mt-auto">
          <button
            onClick={copyPhone}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors",
              copied
                ? "bg-emerald-100 text-emerald-700"
                : "bg-secondary text-foreground hover:bg-secondary/70",
            )}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy Number"}
          </button>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-white text-xs font-semibold transition-colors"
            style={{ backgroundColor: "#25D366" }}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            WhatsApp
          </a>

          {/* Resident: copy WhatsApp number */}
          {!isAdmin && (
            <button
              onClick={copyWhatsApp}
              title="Copy WhatsApp number"
              className={cn(
                "p-2 rounded-lg text-xs font-semibold transition-colors border",
                copiedWa
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/60",
              )}
            >
              {copiedWa ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Admin edit / delete */}
          {isAdmin && (
            <div className="flex items-center gap-0.5 ml-0.5">
              <button
                onClick={() => onEdit?.(contact)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                aria-label="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete?.(contact.id)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
