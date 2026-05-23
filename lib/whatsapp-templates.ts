// WhatsApp message templates for sales outreach to PK societies.
//
// Templates use {{placeholder}} syntax, replaced with lead fields at
// click time. The salesperson can preview + edit the message inside
// WhatsApp before sending. Pre-fill keeps repetitive typing low while
// keeping the door open for personalisation.

export const WHATSAPP_TEMPLATES = {
  initial_outreach: {
    label: "Initial outreach",
    body:
      "Assalam-o-Alaikum {{contact_name}},\n\n" +
      "Main {{owner_name}} se hoon — hum Pulse BMS ka kaam karte hain, ek complete building management software jo Karachi mein societies ko maintenance, bills, receipts aur reports manage karne mein madad karta hai.\n\n" +
      "Kya aap 10-15 minute ka time de sakte hain demo ke liye? In-person ya WhatsApp video — jo aapke liye comfortable ho.\n\n" +
      "Shukriya!\n" +
      "Pulse BMS",
  },
  demo_credentials: {
    label: "Send demo credentials",
    body:
      "Hello {{contact_name}},\n\n" +
      "Thank you for your interest in Pulse BMS. Here are the demo credentials — you can explore three separate dashboards (Admin, Union, and Resident) to see how each role experiences the platform.\n\n" +
      "🌐 Demo link:\n" +
      "https://bms.musabkhan.me/\n\n" +
      "🔑 Admin (Treasurer view):\n" +
      "Email: admin@demo.pulse.app\n" +
      "Password: PulseDemo2026!\n\n" +
      "🔑 Union (Committee view):\n" +
      "Email: union@demo.pulse.app\n" +
      "Password: PulseDemo2026!\n\n" +
      "🔑 Resident (Member view):\n" +
      "Email: resident@demo.pulse.app\n" +
      "Password: PulseDemo2026!\n\n" +
      "Everything inside is dummy data — feel free to try out receipts, reports, bills, and payments. Let me know if you have any questions or would like a walkthrough.\n\n" +
      "Best regards,\n" +
      "Pulse Team",
  },
  demo_followup: {
    label: "After demo",
    body:
      "Assalam-o-Alaikum {{contact_name}},\n\n" +
      "Shukriya aaj waqt dene ke liye. Pulse BMS demo aapko pasand aaye to please aap apni committee se discuss karein.\n\n" +
      "Kisi bhi sawaal ke liye main yahan hoon. Pricing aur next steps ke liye batayein kab call karein?\n\n" +
      "Pulse BMS",
  },
  quotation_sent: {
    label: "Quotation sent",
    body:
      "Assalam-o-Alaikum {{contact_name}},\n\n" +
      "Aapki society ke liye proposal share kar raha hoon. Pricing flat count ke hisaab se calculate ki hai.\n\n" +
      "Review karke batayein, aur agar koi tabdeeli chahiye to humein bata dein.\n\n" +
      "Shukriya,\n" +
      "Pulse BMS",
  },
  gentle_nudge: {
    label: "Gentle nudge",
    body:
      "Assalam-o-Alaikum {{contact_name}},\n\n" +
      "Umeed hai aap kheriyat se hain. Pichli baat ke baad check-in karna chahta tha — agar Pulse BMS pe koi sawaal ya feedback hai, please share karein.\n\n" +
      "Aap convenient ho to ek short call kar sakte hain?\n\n" +
      "Shukriya,\n" +
      "Pulse BMS",
  },
  thank_you: {
    label: "Thank you",
    body:
      "Assalam-o-Alaikum {{contact_name}},\n\n" +
      "Shukriya Pulse BMS choose karne ke liye! Onboarding shuru karte hain — agle 24 ghante mein aapko aap ki society ka admin login mil jayega.\n\n" +
      "Welcome aboard!\n" +
      "Pulse BMS",
  },
  reengage: {
    label: "Re-engage dormant",
    body:
      "Assalam-o-Alaikum {{contact_name}},\n\n" +
      "Pichli baar baat hue kuch time ho gaya. Hum ne Pulse BMS mein kuch nayi features add ki hain (receipts, bill tracking, audit reports). Agar interest ho to ek choti si demo ke liye time nikaalein?\n\n" +
      "Shukriya,\n" +
      "Pulse BMS",
  },
} as const;

export type WhatsappTemplateKey = keyof typeof WHATSAPP_TEMPLATES;

export const WHATSAPP_TEMPLATE_KEYS = Object.keys(
  WHATSAPP_TEMPLATES,
) as WhatsappTemplateKey[];

/**
 * Strip non-digits and produce a `wa.me/<intl>?text=<encoded>` link.
 * Caller is responsible for passing an already-normalized international
 * phone number (e.g. `923001234567`) — we accept loose input but only
 * digits survive the strip.
 */
export function buildWhatsappLink(
  phone: string,
  templateKey: WhatsappTemplateKey,
  vars: { contact_name: string; owner_name: string },
): string {
  const tpl = WHATSAPP_TEMPLATES[templateKey];
  const text = tpl.body
    .replaceAll("{{contact_name}}", vars.contact_name || "")
    .replaceAll("{{owner_name}}", vars.owner_name || "");
  const cleanPhone = phone.replace(/\D/g, "");
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * A "custom message" deeplink — opens WhatsApp chat with no pre-filled
 * text so the salesperson can type whatever they need.
 */
export function buildWhatsappCustomLink(phone: string): string {
  const cleanPhone = phone.replace(/\D/g, "");
  return `https://wa.me/${cleanPhone}`;
}
