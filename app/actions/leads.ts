"use server";

// Sales CRM server actions. Every action requires super_admin OR sales
// role — leads are prospect societies (not yet customers) and live
// outside the per-building multi-tenant model. Sales-team members are
// restricted to this module only; the rest of the app is locked down
// for them at the route + sidebar layer. RLS on bms_leads +
// bms_lead_activities enforces the same role check at the DB layer
// (defence in depth).

import { requireRole, requireNotDemo } from "@/lib/auth";
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
  | "other"
  | "website";

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

/**
 * Follow-up "channel" the rep used to contact the prospect. Maps to one
 * of the underlying ActivityType values for storage so the existing
 * timeline icons + analytics keep working. The structured Log-a-Follow-up
 * card UI uses these channels; the legacy free-form logActivity entry
 * point still writes raw ActivityType (used by the demo-credentials
 * auto-log path).
 */
export type FollowupChannel = "call" | "whatsapp" | "meeting" | "demo" | "other";

const CHANNEL_TO_ACTIVITY: Record<FollowupChannel, ActivityType> = {
  call: "call",
  whatsapp: "whatsapp_sent",
  meeting: "meeting",
  demo: "demo",
  other: "note",
};

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
  /**
   * Per-flat monthly maintenance fee (PKR). Optional — set when the
   * sales rep knows the number. Used by the lead detail page to
   * derive total monthly collection + Pulse fee as a % of it.
   */
  maintenance_per_flat?: number | null;
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

  const maintenance =
    input.maintenance_per_flat == null
      ? null
      : Number(input.maintenance_per_flat);
  if (
    maintenance != null &&
    (!Number.isFinite(maintenance) || maintenance < 0)
  ) {
    throw new Error(
      "Maintenance per flat must be zero or a positive number.",
    );
  }

  // NOTE: next_followup_date is intentionally NOT returned here. That
  // column is now derived state owned by the activity sync logic in
  // logFollowup — every contact attempt carries its own
  // followup_due_date, and the lead's denormalised
  // bms_leads.next_followup_date is updated to the MAX across the lead's
  // activities. createLead / updateLead must never overwrite it from
  // form input (which would clobber the latest activity-derived value).
  // We keep the LeadInput field optional for action-contract back-compat,
  // but silently drop it here.
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
    quoted_amount: quoted,
    maintenance_per_flat: maintenance,
    notes: trimOrNull(input.notes),
  };
}

export async function createLead(input: LeadInput) {
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();

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
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();
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

/**
 * Inline interest-level update from the Leads list. Patches just the
 * `temperature` column so the sales rep can flip High / Medium / Low
 * straight from the row without opening the detail page.
 */
export async function updateLeadInterest(
  id: string,
  interest: LeadTemperature,
) {
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();
  if (!id) throw new Error("Lead id required.");

  const supabase = await createClient();
  // Archive guard — archived leads stay read-only.
  await loadActiveLead(supabase, id);

  const { error } = await supabase
    .from("bms_leads")
    .update({ temperature: interest })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action: "lead.update_interest",
    entity: "lead",
    entity_id: id,
    meta: { temperature: interest },
  });

  revalidatePath(LEADS_PATH);
  revalidatePath(`${LEADS_PATH}/${id}`);
}

/**
 * Inline follow-up date edit from the Leads list. Patches the
 * `next_followup_date` column directly so the sales rep can re-schedule
 * straight from the row without opening the detail page.
 *
 * NOTE: This column is also derived from the latest `followup_due_date`
 * across the lead's activities (see `logFollowup`). A manual edit here
 * lives until the next activity-driven sync rewrites it — which is the
 * intended behaviour ("change of plans" vs "I just contacted them").
 */
export async function setLeadNextFollowup(
  id: string,
  date: string | null,
) {
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();
  if (!id) throw new Error("Lead id required.");

  const clean =
    date && date.trim() && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())
      ? date.trim()
      : null;

  const supabase = await createClient();
  await loadActiveLead(supabase, id);

  const { error } = await supabase
    .from("bms_leads")
    .update({ next_followup_date: clean })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action: "lead.update_next_followup",
    entity: "lead",
    entity_id: id,
    meta: { next_followup_date: clean },
  });

  revalidatePath(LEADS_PATH);
  revalidatePath(`${LEADS_PATH}/${id}`);
  revalidatePath("/super-admin");
}

export async function changeLeadStatus(
  id: string,
  status: LeadStatus,
  note?: string,
) {
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();
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
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();
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
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();
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
  const { user } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();
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
 * Structured follow-up entry — the primary "log a contact attempt"
 * surface on the lead detail page. Each call inserts one activity row
 * with the channel-mapped activity_type, the verbatim response received,
 * and an optional next-follow-up date. The lead's denormalised
 * bms_leads.next_followup_date is then synced to the MAX
 * followup_due_date across all of this lead's activities so the
 * Due-today / Overdue KPIs (which still read next_followup_date) stay
 * accurate even if reps log entries out of order.
 *
 * Note: the legacy `logActivity` entry point is kept intact for the
 * WhatsApp template auto-log path (SendDemoButton / WhatsappButton),
 * which fires-and-forgets a raw ActivityType without a follow-up date.
 */
export async function logFollowup(opts: {
  lead_id: string;
  channel: FollowupChannel;
  response: string;
  next_followup_date?: string | null; // YYYY-MM-DD or null
}) {
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();
  if (!opts.lead_id) throw new Error("Lead id required.");
  const response = opts.response?.trim();
  if (!response) {
    throw new Error("Please describe what response you received.");
  }

  const supabase = await createClient();
  // Archive guard — re-uses the same protection createLead/updateLead use.
  await loadActiveLead(supabase, opts.lead_id);

  const next =
    opts.next_followup_date && String(opts.next_followup_date).trim()
      ? String(opts.next_followup_date).trim()
      : null;

  // 1) Insert the activity row.
  const { error: actErr } = await supabase
    .from("bms_lead_activities")
    .insert({
      lead_id: opts.lead_id,
      activity_type: CHANNEL_TO_ACTIVITY[opts.channel],
      note: response,
      followup_due_date: next,
      meta: { channel: opts.channel },
      actor_id: user.id,
    });
  if (actErr) throw new Error(actErr.message);

  // 2) Sync the denormalised next_followup_date on bms_leads.
  // Always read the current MAX across all activities (could be the new
  // row, an older row, or null if no activity has a date set) so the
  // KPI surface stays accurate regardless of insert order.
  const { data: latest } = await supabase
    .from("bms_lead_activities")
    .select("followup_due_date")
    .eq("lead_id", opts.lead_id)
    .not("followup_due_date", "is", null)
    .order("followup_due_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: leadErr } = await supabase
    .from("bms_leads")
    .update({ next_followup_date: latest?.followup_due_date ?? null })
    .eq("id", opts.lead_id);
  if (leadErr) throw new Error(leadErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    action: "lead.followup",
    entity: "lead",
    entity_id: opts.lead_id,
    meta: {
      channel: opts.channel,
      next_followup_date: next,
    },
  });

  revalidatePath(`${LEADS_PATH}/${opts.lead_id}`);
  revalidatePath(LEADS_PATH);
  revalidatePath("/super-admin");
}

/**
 * Inline notes update from the lead detail page. Separate from updateLead
 * so the UI can do a quick "edit notes" without re-validating everything.
 */
export async function updateLeadNotes(id: string, notes: string | null) {
  const { user, profile } = await requireRole(["super_admin", "sales"]);
  await requireNotDemo();
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
