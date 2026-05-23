"use server";

// Public onboarding action.
//
// The /onboarding page is unauthenticated — visitors fill in their
// society details and hit submit. We insert a row into bms_leads with
// source='website' so it surfaces in the super_admin Leads CRM for
// follow-up. Since the visitor has no session, the bms_leads RLS policy
// (super_admin / sales only) would reject the insert — we use the
// service-role admin client to bypass RLS for this specific path.
//
// Guards:
//   ── Honeypot field — bots fill `website_url`; humans don't.
//   ── Server-side length validation on every text field.
//   ── Phone normalised via normalizePkPhone (same as Teams form).
//   ── Duplicate detection on (whatsapp_number) — refuses a second
//      submission within 24 h so spammers can't flood the pipeline.

import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { normalizePkPhone, isValidPkPhone } from "@/lib/pk-phone";
import { revalidatePath } from "next/cache";

export type OnboardingInput = {
  building_name: string;
  area?: string | null;
  city?: string | null;
  flat_count: number;
  contact_name: string;
  contact_role:
    | "president"
    | "treasurer"
    | "secretary"
    | "member"
    | "admin"
    | "other";
  whatsapp_number: string;
  email?: string | null;
  notes?: string | null;
  /** Bot honeypot — must be empty. Bots fill it; humans don't see it. */
  website_url?: string;
};

const MAX_LEN = {
  building_name: 120,
  area: 80,
  city: 60,
  contact_name: 80,
  whatsapp_number: 20,
  email: 120,
  notes: 800,
};

function trimOrNull(v?: string | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function submitOnboarding(input: OnboardingInput) {
  // 1) Honeypot — bots fill this field, humans don't see it.
  if (input.website_url && input.website_url.trim() !== "") {
    // Pretend success so bots don't learn they were caught.
    return { ok: true as const };
  }

  // 2) Validate
  const building_name = trimOrNull(input.building_name);
  const contact_name = trimOrNull(input.contact_name);
  const rawPhone = trimOrNull(input.whatsapp_number);
  const rawEmail = trimOrNull(input.email);

  if (!building_name) throw new Error("Building name is required.");
  if (building_name.length > MAX_LEN.building_name) {
    throw new Error("Building name is too long.");
  }
  if (!contact_name) throw new Error("Contact name is required.");
  if (contact_name.length > MAX_LEN.contact_name) {
    throw new Error("Contact name is too long.");
  }
  if (!rawPhone) throw new Error("WhatsApp number is required.");

  const phone = normalizePkPhone(rawPhone);
  if (!isValidPkPhone(phone)) {
    throw new Error(
      "Please enter a valid WhatsApp number (e.g. 03001234567).",
    );
  }

  if (rawEmail && !isValidEmail(rawEmail)) {
    throw new Error(
      `"${rawEmail}" doesn't look like a complete email. Add the rest or leave it blank.`,
    );
  }
  if (rawEmail && rawEmail.length > MAX_LEN.email) {
    throw new Error("Email is too long.");
  }

  const flat_count = Number(input.flat_count);
  if (!Number.isFinite(flat_count) || flat_count < 1 || flat_count > 50000) {
    throw new Error("Please enter a valid number of flats.");
  }

  const area = trimOrNull(input.area);
  if (area && area.length > MAX_LEN.area) {
    throw new Error("Area is too long.");
  }
  const city = trimOrNull(input.city) ?? "Karachi";
  if (city.length > MAX_LEN.city) {
    throw new Error("City name is too long.");
  }

  const notes = trimOrNull(input.notes);
  if (notes && notes.length > MAX_LEN.notes) {
    throw new Error("Notes are too long (max 800 characters).");
  }

  const allowedRoles = new Set([
    "president",
    "treasurer",
    "secretary",
    "member",
    "admin",
    "other",
  ]);
  if (!allowedRoles.has(input.contact_role)) {
    throw new Error("Invalid contact role.");
  }

  const admin = createAdminClient();

  // 3) Duplicate-submission guard — if the same WhatsApp number was used
  // in the last 24h, surface a soft success rather than spamming the
  // pipeline with the same lead.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await admin
    .from("bms_leads")
    .select("id")
    .eq("whatsapp_number", phone)
    .gte("created_at", dayAgo)
    .maybeSingle();

  if (existing) {
    return { ok: true as const, deduped: true };
  }

  // 4) Insert the lead.
  const { data: row, error } = await admin
    .from("bms_leads")
    .insert({
      building_name,
      area,
      city,
      flat_count_estimate: Math.floor(flat_count),
      contact_name,
      contact_role: input.contact_role,
      whatsapp_number: phone,
      email: rawEmail,
      source: "website",
      status: "new",
      temperature: "warm",
      notes,
      // No owner_id on website-sourced leads — they're unassigned
      // until a super_admin or sales rep picks them up.
      owner_id: null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // 5) Seed an initial activity so the timeline shows where the lead
  // came from at a glance.
  await admin.from("bms_lead_activities").insert({
    lead_id: row.id,
    activity_type: "note",
    note: `Submitted onboarding form. ${notes ? `Their note: "${notes}"` : "No additional notes."}`,
    meta: { source: "website" },
    actor_id: null,
  });

  // 6) Audit log. No actor_id because the visitor is anonymous; the
  // building_id is null because leads are pre-customer.
  await writeAuditLog({
    actor_id: null,
    actor_email: rawEmail ?? "anonymous",
    actor_role: "website_visitor",
    action: "lead.create_via_onboarding",
    entity: "lead",
    entity_id: row.id,
    meta: {
      source: "website",
      building_name,
      flat_count_estimate: Math.floor(flat_count),
    },
  });

  revalidatePath("/super-admin/leads");
  revalidatePath("/super-admin");

  return { ok: true as const, deduped: false };
}
