"use client";

// Big green WhatsApp button + template dropdown for the lead detail page.
// Click opens a menu of templates → picking one builds the wa.me link with
// pre-filled text and opens in a new tab. We also log a `whatsapp_sent`
// activity row so the timeline keeps a record of every outreach.

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATE_KEYS,
  buildWhatsappLink,
  buildWhatsappCustomLink,
  type WhatsappTemplateKey,
} from "@/lib/whatsapp-templates";
import { logActivity } from "@/app/actions/leads";

export function WhatsappButton({
  leadId,
  phone,
  contactName,
  ownerName,
}: {
  leadId: string;
  phone: string;
  contactName: string;
  ownerName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click — keeps the dropdown lightweight, no Radix popover.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function openTemplate(key: WhatsappTemplateKey) {
    const url = buildWhatsappLink(phone, key, {
      contact_name: contactName,
      owner_name: ownerName,
    });
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
    try {
      await logActivity(
        leadId,
        "whatsapp_sent",
        `Sent template: ${WHATSAPP_TEMPLATES[key].label}`,
        { template: key },
      );
      router.refresh();
    } catch (err) {
      toast({
        title: "Opened WhatsApp but could not log activity",
        description: friendlyErrorMessage(err),
        variant: "destructive",
      });
    }
  }

  function openCustom() {
    window.open(buildWhatsappCustomLink(phone), "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <Button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-big bg-success hover:bg-success/90 text-white"
      >
        <MessageCircle className="w-5 h-5 mr-2" />
        WhatsApp
        <ChevronDown className="w-4 h-4 ml-2" />
      </Button>
      {open && (
        <div className="absolute z-30 top-full mt-2 left-0 w-80 rounded-xl border border-border bg-card shadow-2xl p-1.5 animate-fade-in">
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            Templates
          </div>
          {WHATSAPP_TEMPLATE_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => openTemplate(k)}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary/60 transition text-sm"
            >
              <div className="font-medium">{WHATSAPP_TEMPLATES[k].label}</div>
              <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {WHATSAPP_TEMPLATES[k].body
                  .replaceAll("{{contact_name}}", contactName)
                  .replaceAll("{{owner_name}}", ownerName)
                  .split("\n")
                  .filter(Boolean)
                  .slice(1, 3)
                  .join(" · ")}
              </div>
            </button>
          ))}
          <div className="border-t border-border my-1" />
          <button
            type="button"
            onClick={openCustom}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary/60 transition text-sm font-medium"
          >
            Custom message…
          </button>
        </div>
      )}
    </div>
  );
}
