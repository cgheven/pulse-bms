"use server";

import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

const VALID_PACKAGES = ["starter", "growth", "pro"] as const;
const VALID_STATUSES = ["new", "contacted", "converted"] as const;

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_RE = /^[\d\s+\-().]{7,30}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}$/;

export type InquiryInput = {
  president_name: string;
  building_name: string;
  city?: string;
  num_flats: number;
  package: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  contact_timing?: string;
  starting_date?: string;
  message?: string;
};

export async function submitInquiry(input: InquiryInput): Promise<void> {
  const presidentName  = input.president_name?.trim()    ?? "";
  const buildingName   = input.building_name?.trim()     ?? "";
  const city           = input.city?.trim()              ?? "";
  const phone          = input.phone?.trim()             ?? "";
  const whatsapp       = input.whatsapp?.trim()          ?? "";
  const email          = input.email?.trim()             ?? "";
  const message        = input.message?.trim()           ?? "";
  const contactTiming  = input.contact_timing?.trim()    ?? "";
  const startingDate   = input.starting_date?.trim()     ?? "";
  const pkg            = input.package?.trim()           ?? "";

  // ── Required fields ──────────────────────────────────────────────────────────
  if (presidentName.length < 2 || presidentName.length > 100)
    throw new Error("Contact name must be between 2 and 100 characters.");
  if (buildingName.length < 2 || buildingName.length > 100)
    throw new Error("Building name must be between 2 and 100 characters.");
  if (!Number.isInteger(input.num_flats) || input.num_flats < 1 || input.num_flats > 2000)
    throw new Error("Number of flats must be between 1 and 2000.");
  if (!PHONE_RE.test(phone))
    throw new Error("Please enter a valid phone number (digits, spaces, +, - only).");
  if (!(VALID_PACKAGES as readonly string[]).includes(pkg))
    throw new Error("Please select a valid package.");

  // ── Optional fields ───────────────────────────────────────────────────────────
  if (city && city.length > 100)
    throw new Error("City name must be 100 characters or fewer.");
  if (whatsapp && !PHONE_RE.test(whatsapp))
    throw new Error("Please enter a valid WhatsApp number.");
  if (email && !EMAIL_RE.test(email))
    throw new Error("Please enter a valid email address.");
  if (email && email.length > 254)
    throw new Error("Email address is too long.");
  if (message && message.length > 1000)
    throw new Error("Message must be 1000 characters or fewer.");
  if (contactTiming && contactTiming.length > 100)
    throw new Error("Contact timing is too long.");

  // Use anon client — RLS anon INSERT policy handles the permission.
  // Never use the service-role key for public-facing actions.
  const anon = createAnonClient();

  const { error } = await anon.from("bms_website_inquiries").insert({
    president_name: presidentName,
    building_name:  buildingName,
    city:           city          || null,
    num_flats:      input.num_flats,
    package:        pkg,
    phone,
    whatsapp:       whatsapp      || null,
    email:          email         || null,
    contact_timing: contactTiming || null,
    starting_date:  startingDate  || null,
    message:        message       || null,
    status:         "new",
  });

  if (error) {
    // Never expose internal DB error details to anonymous callers.
    console.error("[submitInquiry] insert failed:", error.message);
    throw new Error("Unable to submit your request. Please try again later.");
  }
}

export async function updateInquiryStatus(
  id: string,
  status: "new" | "contacted" | "converted",
): Promise<void> {
  if (!UUID_RE.test(id)) throw new Error("Invalid inquiry ID.");
  if (!(VALID_STATUSES as readonly string[]).includes(status)) throw new Error("Invalid status value.");

  const { user, profile } = await requireRole(["super_admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bms_website_inquiries")
    .update({ status })
    .eq("id", id)
    .select("id");

  if (error) throw new Error("Failed to update status. Please try again.");
  if (!data?.length) throw new Error("Inquiry not found.");

  await writeAuditLog({
    actor_id:   user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action:     "website_inquiry.status_update",
    entity:     "bms_website_inquiries",
    entity_id:  id,
    meta:       { status },
  });

  revalidatePath("/super-admin/inquiries");
  revalidatePath("/super-admin/trials");
}

export async function deleteInquiry(id: string): Promise<void> {
  if (!UUID_RE.test(id)) throw new Error("Invalid inquiry ID.");

  const { user, profile } = await requireRole(["super_admin"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("bms_website_inquiries")
    .delete()
    .eq("id", id);

  if (error) throw new Error("Failed to delete inquiry. Please try again.");

  await writeAuditLog({
    actor_id:   user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action:     "website_inquiry.delete",
    entity:     "bms_website_inquiries",
    entity_id:  id,
  });

  revalidatePath("/super-admin/inquiries");
  revalidatePath("/super-admin/trials");
}
