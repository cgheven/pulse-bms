"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { writeAuditLog } from "@/lib/audit";
import { TRADE_KEYS, type TradeKey, type ServiceContact } from "@/lib/trade-contacts";
import { revalidatePath } from "next/cache";

export type ContactInput = {
  id?: string;
  name: string;
  trade: string;
  phone: string;
  whatsapp?: string | null;
  is_available: boolean;
  notes?: string | null;
  sort_order?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(input: ContactInput) {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Name must be at least 2 characters");
  if (name.length > 100) throw new Error("Name is too long");

  const phone = input.phone.trim();
  if (phone.length < 7) throw new Error("Enter a valid phone number");
  if (phone.length > 20) throw new Error("Phone number is too long");

  // Type-safe trade check — no `as never` cast
  if (!(TRADE_KEYS as readonly string[]).includes(input.trade)) throw new Error("Invalid trade");

  const whatsapp = input.whatsapp?.trim() || null;
  if (whatsapp && whatsapp.length > 20) throw new Error("WhatsApp number is too long");

  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 300) throw new Error("Notes must be 300 characters or less");

  if (input.id && !UUID_RE.test(input.id)) throw new Error("Invalid contact ID");

  return { name, phone, whatsapp, notes };
}

function revalidate() {
  revalidatePath("/admin/contacts");
  revalidatePath("/resident/contacts");
  revalidatePath("/union/contacts");
}

export async function upsertServiceContact(input: ContactInput): Promise<ServiceContact> {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  // super_admin with no active building selected has no scope to create contacts
  if (!buildingId) throw new Error("No active building selected.");

  const { name, phone, whatsapp, notes } = validate(input);
  const supabase = await createClient();

  const payload = {
    building_id: buildingId,
    name,
    trade: input.trade as TradeKey,
    phone,
    whatsapp,
    is_available: input.is_available,
    notes,
    sort_order: input.sort_order ?? 0,
    updated_at: new Date().toISOString(),
  };

  let data: ServiceContact;

  if (input.id) {
    const { data: row, error } = await supabase
      .from("bms_service_contacts")
      .update(payload)
      .eq("id", input.id)
      .eq("building_id", buildingId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    data = row as ServiceContact;
  } else {
    const { data: row, error } = await supabase
      .from("bms_service_contacts")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    data = row as ServiceContact;
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: input.id ? "service_contact.update" : "service_contact.create",
    entity: "service_contact",
    entity_id: data.id,
    meta: { name, trade: input.trade },
  });

  revalidate();
  return data;
}

export async function deleteServiceContact(id: string): Promise<void> {
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  if (!UUID_RE.test(id)) throw new Error("Invalid contact ID");

  const supabase = await createClient();

  const { error } = await supabase
    .from("bms_service_contacts")
    .delete()
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "service_contact.delete",
    entity: "service_contact",
    entity_id: id,
  });

  revalidate();
}

export async function getServiceContacts(buildingId: string): Promise<ServiceContact[]> {
  // Require authentication — this file is "use server" so callable from client
  await requireRole(["admin", "super_admin", "union", "resident"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bms_service_contacts")
    .select("*")
    .eq("building_id", buildingId)
    .order("sort_order", { ascending: true })
    .order("trade", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    console.error("[service-contacts] fetch failed:", error.message);
    return [];
  }
  return (data ?? []) as ServiceContact[];
}
