"use server";

// Sales CRM server actions. Every action requires super_admin role —
// leads are prospect societies (not yet customers) and live outside the
// per-building multi-tenant model. RLS on bms_leads + bms_lead_activities
// enforces the same guard at the DB layer (defence in depth).

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { normalizePkPhone, isValidPkPhone } from "@/lib/pk-phone";
import { revalidatePath } from "next/cache";

export type LeadStatus =
  | "new"
  | "contacted"
  | "demo_done"
  | "negotiating"
  | "won"
  | "lost"
  | "dormant";

export type LeadTemperature = "hot" | "warm" | "cold";

export type LeadSource =
  | "cold_visit"
  | "referral"
  | "whatsapp_inbound"
  | "event"
  | "other";

export type LeadRole =
  | "president"
  | "treasurer"
  | "secretary"
  | "member"
  | "admin"
  | "other";

export type ActivityType =
  | "note"
  | "call"
  | "whatsapp_sent"
  | "whatsapp_received"
  | "meeting"
  | "demo"
  | "quote_sent"
  | "status_change";

export type LeadInput = {
  building_name: string;
  area?: string | null;
  city?: string | null;
  flat_count_estimate?: number | null;
  contact_name: string;
  contact_role: LeadRole;
  whatsapp_number: string;
  email?: string | null;
  source: LeadSource;
  status?: LeadStatus;
  temperature: LeadTemperature;
  next_followup_date?: string | null;
  quoted_amount?: number | null;
  notes?: string | null;
};

const LEADS_PATH = "/super-admin/leads";

function trimOrNull(v?: string | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

type ActiveLead = {
  id: string;
  archived_at: string | null;
  status: LeadStatus;
  owner_id: string | null;
};

/**
 * Pre-fetch a lead and reject if it is archived. Every mutating action
 * (update, status change, notes, activity log) calls this so an archived
 * lead can't be edited via a stale dialog or a direct server-action call.
 * `archiveLead` does NOT use this — it has its own idempotency check.
 */
async function loadActiveLead(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<ActiveLead> {
  const { data, error } = await supabase
    .from("bms_leads")
    .select("id, archived_at, status, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lead not found.");
  if (data.archived_at)
    throw new Error("Lead is archived. Restore it first.");
  return data as ActiveLead;
}

/**
 * Run shared validation + normalisation. Throws Error with a friendly
 * message on the first failure so the toast surface is readable.
 */
function validateAndNormalize(input: LeadInput) {
  const building_name = input.building_name?.trim();
  const contact_name = input.contact_name?.trim();
  if (!building_name) throw new Error("Building name is required.");
  if (!contact_name) throw new Error("Contact name is required.");

  const rawPhone = input.whatsapp_number?.trim();
  if (!rawPhone) throw new Error("WhatsApp number is required.");
  const phone = normalizePkPhone(rawPhone);
  if (!isValidPkPhone(phone)) {
    throw new Error(
      "Please enter a valid WhatsApp number (10–15 digits, e.g. 03001234567).",
    );
  }

  const flat_count =
    input.flat_count_estimate == null
      ? null
      : Number(input.flat_count_estimate);
  if (flat_count != null && (!Number.isFinite(flat_count) || flat_count < 0)) {
    throw new Error("Flat count must be zero or a positive number.");
  }

  const quoted =
    input.quoted_amount == null ? null : Number(input.quoted_amount);
  if (quoted != null && (!Number.isFinite(quoted) || quoted < 0)) {
    throw new Error("Quoted amount must be zero or a positive number.");
  }

  return {
    building_name,
    area: trimOrNull(input.area),
    city: trimOrNull(input.city) ?? "Karachi",
    flat_count_estimate: flat_count,
    contact_name,
    contact_role: input.contact_role,
    whatsapp_number: phone,
    email: trimOrNull(input.email),
    source: input.source,
    status: input.status ?? "new",
    temperature: input.temperature,
    next_followup_date: trimOrNull(input.next_followup_date),
    quoted_amount: quoted,
    notes: trimOrNull(input.notes),
  };
}

export async function createLead(input: LeadInput) {
  const { user, profile } = await requireRole("super_admin");

  const payload = validateAndNormalize(input);

  const supabase = await createClient();
  // Rare path: a lead is created already in 'won' state (e.g. retro entry).
  // Stamp won_at at insert time so the KPI is correct from day one.
  const insertPayload: Record<string, unknown> = {
    ...payload,
    owner_id: user.id,
  };
  if (payload.status === "won") {
    insertPayload.won_at = new Date().toISOString();
  }
  const { data: row, error } = await supabase
    .from("bms_leads")
    .insert(insertPayload)
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Initial activity so the timeline isn't empty.
  await supabase.from("bms_lead_activities").insert({
    lead_id: row.id,
    activity_type: "note",
    note: "Lead created.",
    actor_id: user.id,
  });

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action: "lead.create",
    entity: "lead",
    entity_id: row.id,
    meta: {
      building_name: payload.building_name,
      status: payload.status,
      temperature: payload.temperature,
    },
  });

  revalidatePath(LEADS_PATH);
  revalidatePath("/super-admin");
  return row;
}

export async function updateLead(id: string, input: LeadInput) {
  const { user, profile } = await requireRole("super_admin");
  if (!id) throw new Error("Lead id required.");

  const payload = validateAndNormalize(input);

  const supabase = await createClient();
  // Archive guard + capture previous status for auto-log status_change.
  const prev = await loadActiveLead(supabase, id);

  // updateLead never touches won_at directly — status changes here flow
  // through the same won/un-won transitions handled in changeLeadStatus.
  const updatePayload: Record<string, unknown> = { ...payload };
  if (prev.status !== "won" && payload.status === "won") {
    updatePayload.won_at = new Date().toISOString();
  } else if (prev.status === "won" && payload.status !== "won") {
    updatePayload.won_at = null;
  }

  const { data: row, error } = await supabase
    .from("bms_leads")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (prev.status !== payload.status) {
    await supabase.from("bms_lead_activities").insert({
      lead_id: id,
      activity_type: "status_change",
      note: null,
      meta: { from: prev.status, to: payload.status },
      actor_id: user.id,
    });
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action: "lead.update",
    entity: "lead",
    entity_id: id,
    meta: { status: payload.status, temperature: payload.temperature },
  });

  revalidatePath(LEADS_PATH);
  revalidatePath(`${LEADS_PATH}/${id}`);
  revalidatePath("/super-admin");
  return row;
}

export async function changeLeadStatus(
  id: string,
  status: LeadStatus,
  note?: string,
) {
  const { user, profile } = await requireRole("super_admin");
  if (!id) throw new Error("Lead id required.");

  const supabase = await createClient();
  // Archive guard + previous status.
  const prev = await loadActiveLead(supabase, id);

  // Maintain won_at: stamp on first transition INTO won, clear when
  // moving away (rollback / mis-clicks).
  const updatePayload: Record<string, unknown> = { status };
  if (prev.status !== "won" && status === "won") {
    updatePayload.won_at = new Date().toISOString();
  } else if (prev.status === "won" && status !== "won") {
    updatePayload.won_at = null;
  }

  const { error } = await supabase
    .from("bms_leads")
    .update(updatePayload)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("bms_lead_activities").insert({
    lead_id: id,
    activity_type: "status_change",
    note: null,
    meta: {
      from: prev.status,
      to: status,
      ...(note ? { note } : {}),
    },
    actor_id: user.id,
  });

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action: "lead.status",
    entity: "lead",
    entity_id: id,
    meta: { from: prev.status, to: status, note: note ?? null },
  });

  revalidatePath(LEADS_PATH);
  revalidatePath(`${LEADS_PATH}/${id}`);
  revalidatePath("/super-admin");
}

/**
 * Soft-delete: set archived_at. We never DELETE so the activity history
 * stays auditable for "why did we drop this society?". Idempotency:
 * reject a second archive attempt with a clear message rather than
 * silently bumping the timestamp.
 */
export async function archiveLead(id: string) {
  const { user, profile } = await requireRole("super_admin");
  if (!id) throw new Error("Lead id required.");

  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from("bms_leads")
    .select("id, archived_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!row) throw new Error("Lead not found.");
  if (row.archived_at) throw new Error("Already archived.");

  const { error } = await supabase
    .from("bms_leads")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action: "lead.archive",
    entity: "lead",
    entity_id: id,
  });

  revalidatePath(LEADS_PATH);
  revalidatePath(`${LEADS_PATH}/${id}`);
  revalidatePath("/super-admin");
}

/**
 * HARD delete a lead row. Cascades to bms_lead_activities via the FK
 * `on delete cascade`. Use when the lead is junk data (test entry,
 * duplicate, wrong number) and you want it gone — not just hidden.
 *
 * Audit log captures a snapshot of the deleted lead so "who deleted what
 * and when" stays answerable even though the row is gone.
 */
export async function deleteLead(id: string) {
  const { user, profile } = await requireRole("super_admin");
  if (!id) throw new Error("Lead id required.");

  const supabase = await createClient();

  // Snapshot before delete so audit trail isn't a dead reference.
  const { data: snapshot, error: readErr } = await supabase
    .from("bms_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!snapshot) throw new Error("Lead not found.");

  const { error } = await supabase
    .from("bms_leads")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action: "lead.delete",
    entity: "lead",
    entity_id: id,
    meta: { snapshot } as unknown as Record<string, unknown>,
  });

  revalidatePath(LEADS_PATH);
  revalidatePath("/super-admin");
}

export async function logActivity(
  lead_id: string,
  type: ActivityType,
  note?: string | null,
  meta?: Record<string, unknown>,
) {
  const { user } = await requireRole("super_admin");
  if (!lead_id) throw new Error("Lead id required.");

  const cleanNote = trimOrNull(note);
  // Every human-typed activity (call/meeting/demo/quote_sent/whatsapp_*)
  // needs a non-empty note so the timeline is meaningful. Only
  // status_change is auto-generated and carries context in `meta`.
  if (!cleanNote && type !== "status_change") {
    throw new Error("Please add a short note for this activity.");
  }

  const supabase = await createClient();
  // Archive guard.
  await loadActiveLead(supabase, lead_id);

  const { error } = await supabase.from("bms_lead_activities").insert({
    lead_id,
    activity_type: type,
    note: cleanNote,
    meta: meta ?? null,
    actor_id: user.id,
  });
  if (error) throw new Error(error.message);

  // We DON'T write to the global audit log for every activity — that
  // would flood it. Activity timeline IS the lead's audit trail.
  revalidatePath(`${LEADS_PATH}/${lead_id}`);
}

/**
 * Inline notes update from the lead detail page. Separate from updateLead
 * so the UI can do a quick "edit notes" without re-validating everything.
 */
export async function updateLeadNotes(id: string, notes: string | null) {
  const { user, profile } = await requireRole("super_admin");
  if (!id) throw new Error("Lead id required.");

  const supabase = await createClient();
  // Archive guard — archived leads are read-only.
  await loadActiveLead(supabase, id);

  const { error } = await supabase
    .from("bms_leads")
    .update({ notes: trimOrNull(notes) })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action: "lead.notes",
    entity: "lead",
    entity_id: id,
  });

  revalidatePath(`${LEADS_PATH}/${id}`);
}
