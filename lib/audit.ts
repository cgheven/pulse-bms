import { createAdminClient } from "@/lib/supabase/admin";

export async function writeAuditLog(data: {
  /** Null for anonymous / public-form submissions (e.g. /onboarding). */
  actor_id: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  building_id?: string | null;
  action: string;
  entity: string;
  entity_id?: string;
  meta?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("bms_audit_log").insert({
      actor_id:    data.actor_id,
      actor_email: data.actor_email ?? null,
      actor_role:  data.actor_role  ?? null,
      building_id: data.building_id ?? null,
      action:      data.action,
      entity:      data.entity,
      entity_id:   data.entity_id   ?? null,
      meta:        data.meta        ?? null,
      ip_address:  data.ip_address  ?? null,
      user_agent:  data.user_agent  ?? null,
    });
  } catch {
    // Audit must never block the main action
  }
}
