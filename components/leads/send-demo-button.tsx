"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { displayPkPhone } from "@/lib/pk-phone";
import {
  WHATSAPP_TEMPLATES,
  buildWhatsappLink,
} from "@/lib/whatsapp-templates";
import { logActivity } from "@/app/actions/leads";

/**
 * One-click "Send demo credentials" action — renders as a green pill
 * showing the contact's WhatsApp number. Click opens wa.me with the
 * `demo_credentials` template pre-filled and logs a `whatsapp_sent`
 * activity row so the lead's timeline reflects the outreach.
 *
 * Single action per row keeps the table dense and the most common
 * outreach (send demo creds) stays 1-click.
 */
export function SendDemoButton({
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
  const [pending, startTransition] = useTransition();

  function fire() {
    const url = buildWhatsappLink(phone, "demo_credentials", {
      contact_name: contactName,
      owner_name: ownerName || "",
    });
    window.open(url, "_blank", "noopener,noreferrer");
    startTransition(async () => {
      try {
        await logActivity(
          leadId,
          "whatsapp_sent",
          `Sent template: ${WHATSAPP_TEMPLATES.demo_credentials.label}`,
          { template: "demo_credentials" },
        );
        router.refresh();
      } catch (err) {
        toast({
          title: "Opened WhatsApp but could not log activity",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <button
      type="button"
      onClick={fire}
      disabled={pending}
      title="Send demo credentials via WhatsApp"
      aria-label={`Send demo credentials to ${contactName} on WhatsApp ${displayPkPhone(phone)}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-success/15 text-success hover:bg-success/25 text-sm font-medium transition disabled:opacity-50"
    >
      <Send className="w-4 h-4" />
      <span>{displayPkPhone(phone)}</span>
    </button>
  );
}
