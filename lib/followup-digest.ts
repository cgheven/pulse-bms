import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendFollowupDigest, type DigestLead } from "@/lib/email";

const DIGEST_CC = process.env.DIGEST_CC_EMAIL ?? "musabkhan.queries@gmail.com";

export type DigestResult =
  | { sent: true; todayCount: number; overdueCount: number }
  | { sent: false; reason: string };

export async function buildAndSendDigest(): Promise<DigestResult> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Active sales team members → recipients
  const { data: team, error: teamErr } = await admin
    .from("bms_profiles")
    .select("email, full_name")
    .eq("role", "sales")
    .eq("is_active", true);

  if (teamErr) {
    console.error("[digest] team fetch error:", teamErr);
    return { sent: false, reason: "Could not fetch team members." };
  }
  // Exclude synthesized internal emails (t-<phone>@team.pulse.app) —
  // those are login handles, not real inboxes, and would bounce.
  const toEmails = (team ?? [])
    .map((m) => m.email)
    .filter((e): e is string => Boolean(e) && !e.endsWith("@team.pulse.app"));
  if (toEmails.length === 0) {
    return { sent: false, reason: "No active team members with an email address." };
  }

  // Leads due today
  const { data: rawToday, error: tErr } = await admin
    .from("bms_leads")
    .select("id, building_name, city, contact_name, contact_role, whatsapp_number, status, temperature, next_followup_date, notes, owner_id")
    .eq("next_followup_date", today)
    .is("archived_at", null)
    .not("status", "in", "(won,lost)")
    .order("building_name");

  // Overdue leads (past due, not archived, not closed)
  const { data: rawOverdue, error: oErr } = await admin
    .from("bms_leads")
    .select("id, building_name, city, contact_name, contact_role, whatsapp_number, status, temperature, next_followup_date, notes, owner_id")
    .lt("next_followup_date", today)
    .not("next_followup_date", "is", null)
    .is("archived_at", null)
    .not("status", "in", "(won,lost)")
    .order("next_followup_date");

  if (tErr || oErr) {
    console.error("[digest] leads fetch error:", tErr ?? oErr);
    return { sent: false, reason: "Could not fetch leads." };
  }

  const allLeads = [...(rawToday ?? []), ...(rawOverdue ?? [])];
  if (allLeads.length === 0) {
    return { sent: false, reason: "No leads due today or overdue — nothing to send." };
  }

  // Resolve owner names in one query
  const ownerIds = [...new Set(allLeads.map((l) => l.owner_id).filter(Boolean))];
  const ownerMap: Record<string, string> = {};
  if (ownerIds.length > 0) {
    const { data: owners } = await admin
      .from("bms_profiles")
      .select("id, full_name")
      .in("id", ownerIds);
    for (const o of owners ?? []) {
      if (o.id) ownerMap[o.id] = o.full_name ?? "—";
    }
  }

  function toDigestLead(l: typeof allLeads[number]): DigestLead {
    return {
      id: l.id,
      building_name: l.building_name,
      city: l.city,
      contact_name: l.contact_name,
      contact_role: l.contact_role,
      whatsapp_number: l.whatsapp_number,
      status: l.status,
      temperature: l.temperature,
      next_followup_date: l.next_followup_date,
      notes: l.notes,
      owner_name: l.owner_id ? (ownerMap[l.owner_id] ?? "—") : "—",
    };
  }

  const todayLeads = (rawToday ?? []).map(toDigestLead);
  const overdueLeads = (rawOverdue ?? []).map(toDigestLead);

  const dateStr = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const { error } = await sendFollowupDigest(toEmails, [DIGEST_CC], todayLeads, overdueLeads, dateStr);
  if (error) return { sent: false, reason: error };

  console.info("[digest] sent", { to: toEmails, cc: DIGEST_CC, todayCount: todayLeads.length, overdueCount: overdueLeads.length });
  return { sent: true, todayCount: todayLeads.length, overdueCount: overdueLeads.length };
}
