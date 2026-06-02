"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { revalidatePath } from "next/cache";
import { recordPayment, type PaymentInput } from "@/app/actions/payments";

export type ContributionRule = "equal" | "custom" | "voluntary";
export type ProjectStatus = "active" | "closed" | "cancelled";

export type ProjectInput = {
  name: string;
  description?: string | null;
  target_amount?: number | null;
  contribution_rule: ContributionRule;
  default_per_flat?: number | null;
  start_date: string;
  end_date?: string | null;
  proposal_id?: string | null;
  /**
   * For 'custom' rule, optionally seed shares at create time. Each row
   * must reference a flat belonging to the caller's building (server
   * verifies).
   */
  per_flat_shares?: Array<{ flat_id: string; expected_amount: number }>;
};

const REVALIDATE_PATHS = [
  "/union/projects",
  "/admin/projects",
  "/resident",
  "/resident/projects",
];

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
  // /admin/reports needs "layout" scope so its child route
  // /admin/reports/projects ALSO busts cache. Without the flag, the
  // child segment keeps serving stale Projects-tab data.
  revalidatePath("/admin/reports", "layout");
}

/**
 * Create a new Project Fund. Admin / union / super_admin only.
 *
 * The rule field locks the math for the project's lifetime — we cannot
 * change it later without recomputing every share row, so we validate
 * the rule's required fields up-front:
 *   - equal:     default_per_flat > 0 (auto-creates a share per active flat)
 *   - custom:    per_flat_shares array can be passed now or filled in later
 *                from the UI editor
 *   - voluntary: no shares are created — defaulters concept does not apply
 */
export async function createProject(input: ProjectInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin", "union"]);
  const buildingId = profile.role === "admin"
    ? await getActiveBuilding()
    : profile.building_id;
  if (!buildingId) throw new Error("No active building selected.");

  // Validate basics
  const name = input.name?.trim();
  if (!name) throw new Error("Project name is required");
  if (input.target_amount != null && input.target_amount < 0) {
    throw new Error("Target amount must be ≥ 0");
  }
  if (!input.start_date) throw new Error("Start date is required");
  if (input.end_date && input.end_date < input.start_date) {
    throw new Error("Deadline cannot be before the start date");
  }

  // Per-rule validation
  if (input.contribution_rule === "equal") {
    if (!input.default_per_flat || input.default_per_flat <= 0) {
      throw new Error("Equal split needs a per-flat amount greater than 0");
    }
  }
  if (input.contribution_rule === "custom" && input.per_flat_shares) {
    for (const s of input.per_flat_shares) {
      if (!s.flat_id) throw new Error("Each share row needs a flat");
      if (s.expected_amount < 0) {
        throw new Error("Expected amount must be ≥ 0");
      }
    }
  }
  // Voluntary projects deliberately have no defaulters concept — passing
  // share rows for one is almost certainly a caller bug (e.g. wrong rule
  // selected in the form). Refuse loudly rather than silently dropping
  // the rows in the seeding branch below.
  if (
    input.contribution_rule === "voluntary" &&
    input.per_flat_shares &&
    input.per_flat_shares.length > 0
  ) {
    throw new Error(
      "Voluntary projects cannot have per-flat shares — use 'custom' rule instead.",
    );
  }

  const supabase = await createClient();

  // Cross-tenant guard: proposal_id (if provided) must belong to caller's
  // building. RLS blocks reads cross-building, but the FK insert would
  // happily accept any uuid otherwise.
  if (input.proposal_id) {
    const { data: prop } = await supabase
      .from("bms_proposals")
      .select("id")
      .eq("id", input.proposal_id)
      .eq("building_id", buildingId)
      .maybeSingle();
    if (!prop) throw new Error("Invalid proposal link");
  }

  // Insert project
  const { data: project, error: insErr } = await supabase
    .from("bms_projects")
    .insert({
      building_id: buildingId,
      name,
      description: input.description?.trim() || null,
      target_amount: input.target_amount ?? null,
      contribution_rule: input.contribution_rule,
      default_per_flat: input.default_per_flat ?? null,
      start_date: input.start_date,
      end_date: input.end_date ?? null,
      status: "active",
      proposal_id: input.proposal_id ?? null,
      created_by: user.id,
    })
    .select()
    .single();
  if (insErr) throw new Error(insErr.message);

  // Seed shares
  let sharesSeeded = 0;
  if (input.contribution_rule === "equal" && input.default_per_flat) {
    const { data: flats } = await supabase
      .from("bms_flats")
      .select("id")
      .eq("building_id", buildingId);
    const rows = (flats ?? []).map((f) => ({
      project_id: project.id,
      flat_id: f.id,
      expected_amount: input.default_per_flat as number,
    }));
    if (rows.length > 0) {
      const { error: shareErr } = await supabase
        .from("bms_project_shares")
        .insert(rows);
      if (shareErr) throw new Error(shareErr.message);
      sharesSeeded = rows.length;
    }
  } else if (
    input.contribution_rule === "custom" &&
    input.per_flat_shares &&
    input.per_flat_shares.length > 0
  ) {
    // Verify every flat_id is in the caller's building before insert.
    const ids = input.per_flat_shares.map((s) => s.flat_id);
    const { data: validFlats } = await supabase
      .from("bms_flats")
      .select("id")
      .eq("building_id", buildingId)
      .in("id", ids);
    const validIds = new Set((validFlats ?? []).map((f) => f.id));
    const rows = input.per_flat_shares
      .filter((s) => validIds.has(s.flat_id))
      .map((s) => ({
        project_id: project.id,
        flat_id: s.flat_id,
        expected_amount: s.expected_amount,
      }));
    if (rows.length > 0) {
      const { error: shareErr } = await supabase
        .from("bms_project_shares")
        .insert(rows);
      if (shareErr) throw new Error(shareErr.message);
      sharesSeeded = rows.length;
    }
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "project.create",
    entity: "project",
    entity_id: project.id,
    meta: {
      name: project.name,
      contribution_rule: project.contribution_rule,
      target_amount: project.target_amount,
      default_per_flat: project.default_per_flat,
      shares_seeded: sharesSeeded,
      proposal_id: project.proposal_id,
    },
  });

  revalidateAll();
  return project;
}

/**
 * Edit name/description/target/end_date. `contribution_rule` is locked
 * after creation — changing it would invalidate every share row.
 *
 * NOTE: `status` is intentionally NOT accepted here. All status changes
 * MUST go through the dedicated `closeProject` / `cancelProject` /
 * `reopenProject` actions so the corresponding `project.close|cancel|
 * reopen` audit events are written. Allowing a generic `status` write
 * here would bypass that trail and let callers stuff arbitrary values
 * into the column.
 */
export async function updateProject(
  id: string,
  input: Partial<
    Pick<
      ProjectInput,
      "name" | "description" | "target_amount" | "end_date" | "default_per_flat"
    >
  >,
) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin", "union"]);
  const buildingId = profile.role === "admin"
    ? await getActiveBuilding()
    : profile.building_id;
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("bms_projects")
    .select("id, building_id, contribution_rule")
    .eq("id", id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!existing) throw new Error("Project not found");

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const trimmed = input.name?.trim();
    if (!trimmed) throw new Error("Project name cannot be empty");
    patch.name = trimmed;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.target_amount !== undefined) {
    if (input.target_amount != null && input.target_amount < 0) {
      throw new Error("Target amount must be ≥ 0");
    }
    patch.target_amount = input.target_amount;
  }
  if (input.end_date !== undefined) patch.end_date = input.end_date || null;
  if (input.default_per_flat !== undefined) {
    patch.default_per_flat = input.default_per_flat;
  }

  const { error } = await supabase
    .from("bms_projects")
    .update(patch)
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "project.update",
    entity: "project",
    entity_id: id,
    meta: patch,
  });

  revalidateAll();
  revalidatePath(`/union/projects/${id}`);
  revalidatePath(`/admin/projects/${id}`);
}

/**
 * Upsert a per-flat share for a 'custom' project. Used by the contributors
 * editor on the project detail page.
 */
export async function updateProjectShare(input: {
  project_id: string;
  flat_id: string;
  expected_amount: number;
}) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin", "union"]);
  const buildingId = profile.role === "admin"
    ? await getActiveBuilding()
    : profile.building_id;
  if (!buildingId) throw new Error("No active building selected.");
  if (input.expected_amount < 0) {
    throw new Error("Expected amount must be ≥ 0");
  }

  const supabase = await createClient();

  // Verify project + flat both belong to caller's building.
  const { data: project } = await supabase
    .from("bms_projects")
    .select("id, building_id, contribution_rule")
    .eq("id", input.project_id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!project) throw new Error("Project not found");
  if (project.contribution_rule === "voluntary") {
    throw new Error("Voluntary projects do not use per-flat shares");
  }

  const { data: flat } = await supabase
    .from("bms_flats")
    .select("id")
    .eq("id", input.flat_id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!flat) throw new Error("Invalid flat");

  // Upsert
  const { data: existing } = await supabase
    .from("bms_project_shares")
    .select("id")
    .eq("project_id", input.project_id)
    .eq("flat_id", input.flat_id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("bms_project_shares")
      .update({ expected_amount: input.expected_amount })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("bms_project_shares")
      .insert({
        project_id: input.project_id,
        flat_id: input.flat_id,
        expected_amount: input.expected_amount,
      });
    if (error) throw new Error(error.message);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "project.share.update",
    entity: "project_share",
    entity_id: input.project_id,
    meta: { flat_id: input.flat_id, expected_amount: input.expected_amount },
  });

  revalidateAll();
  revalidatePath(`/union/projects/${input.project_id}`);
  revalidatePath(`/admin/projects/${input.project_id}`);
}

/**
 * Backfill share rows for an 'equal'-rule project so flats added AFTER the
 * project started also get a defaulter row. Without this, equal-split
 * projects silently exclude any unit registered post-launch from
 * defaulters / WhatsApp reminders / per-flat KPIs.
 *
 * No-op for custom (operator picks who's on the hook) and voluntary
 * (no shares concept).
 *
 * Returns the count of flats added so the UI can show a useful toast.
 */
export async function syncProjectShares(project_id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole([
    "admin",
    "super_admin",
    "union",
  ]);
  const buildingId = profile.role === "admin"
    ? await getActiveBuilding()
    : profile.building_id;
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("bms_projects")
    .select("id, building_id, contribution_rule, default_per_flat, status")
    .eq("id", project_id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!project) throw new Error("Project not found");

  // Sync is meaningful ONLY for equal-rule projects. Custom = operator owns
  // the share list manually. Voluntary = no shares at all.
  if (project.contribution_rule !== "equal") {
    return { added: 0 };
  }
  if (!project.default_per_flat || Number(project.default_per_flat) <= 0) {
    throw new Error(
      "Project has no default per-flat amount — edit it before syncing shares.",
    );
  }

  // Find flats with no existing share row for this project.
  const [{ data: flats }, { data: existingShares }] = await Promise.all([
    supabase
      .from("bms_flats")
      .select("id")
      .eq("building_id", buildingId),
    supabase
      .from("bms_project_shares")
      .select("flat_id")
      .eq("project_id", project_id),
  ]);

  const haveShare = new Set(
    (existingShares ?? []).map(
      (s) => (s as { flat_id: string }).flat_id,
    ),
  );
  const missing = (flats ?? [])
    .map((f) => (f as { id: string }).id)
    .filter((id) => !haveShare.has(id));

  let added = 0;
  if (missing.length > 0) {
    const rows = missing.map((flat_id) => ({
      project_id,
      flat_id,
      expected_amount: Number(project.default_per_flat),
    }));
    const { error } = await supabase
      .from("bms_project_shares")
      .insert(rows);
    if (error) throw new Error(error.message);
    added = rows.length;
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "project.shares.sync",
    entity: "project",
    entity_id: project_id,
    meta: { added_flats: added },
  });

  revalidateAll();
  revalidatePath(`/union/projects/${project_id}`);
  revalidatePath(`/admin/projects/${project_id}`);
  revalidatePath(`/resident/projects`);
  return { added };
}

/**
 * Thin wrapper around recordPayment for a project contribution.
 * Forces category='project' + threads project_id onto the payment row so
 * the report layer can filter by project.
 */
export async function recordProjectContribution(input: {
  project_id: string;
  flat_id: string;
  amount: number;
  resident_id?: string | null;
  payment_date?: string;
  payment_mode?: PaymentInput["payment_mode"];
  reference_no?: string | null;
  notes?: string | null;
  bank_account_id?: string | null;
}) {
  await requireNotDemo();
  const { profile } = await requireRole(["admin", "super_admin", "union"]);
  const buildingId = profile.role === "admin"
    ? await getActiveBuilding()
    : profile.building_id;
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();

  // Cross-tenant + status guard. Closed/cancelled projects refuse new
  // contributions; old ones remain visible in reports.
  const { data: project } = await supabase
    .from("bms_projects")
    .select("id, status, building_id, name")
    .eq("id", input.project_id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!project) throw new Error("Project not found");
  if (project.status !== "active") {
    throw new Error("This project is not accepting contributions");
  }

  // project_id is stamped atomically inside recordPayment so a failure
  // between INSERT and tag can't leave an orphan `category='project'`
  // row invisible to the Projects report. The action cross-tenant
  // validates the project_id, so we don't need to redo that here.
  const row = await recordPayment({
    flat_id: input.flat_id,
    resident_id: input.resident_id ?? null,
    invoice_id: null,
    amount: input.amount,
    payment_date: input.payment_date,
    payment_mode: input.payment_mode ?? "cash",
    reference_no: input.reference_no ?? null,
    category: "project" as PaymentInput["category"],
    notes: input.notes ?? `Contribution to ${project.name}`,
    bank_account_id: input.bank_account_id ?? null,
    project_id: input.project_id,
  });

  revalidateAll();
  revalidatePath(`/union/projects/${input.project_id}`);
  revalidatePath(`/admin/projects/${input.project_id}`);
  return row;
}

export async function closeProject(id: string) {
  return await transitionStatus(id, "closed", "project.close");
}

export async function cancelProject(id: string) {
  return await transitionStatus(id, "cancelled", "project.cancel");
}

export async function reopenProject(id: string) {
  return await transitionStatus(id, "active", "project.reopen");
}

async function transitionStatus(
  id: string,
  next: ProjectStatus,
  action: string,
) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin", "union"]);
  const buildingId = profile.role === "admin"
    ? await getActiveBuilding()
    : profile.building_id;
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_projects")
    .update({ status: next })
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action,
    entity: "project",
    entity_id: id,
    meta: { status: next },
  });

  revalidateAll();
  revalidatePath(`/union/projects/${id}`);
  revalidatePath(`/admin/projects/${id}`);
}

export async function linkProposal(project_id: string, proposal_id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin", "union"]);
  const buildingId = profile.role === "admin"
    ? await getActiveBuilding()
    : profile.building_id;
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { data: prop } = await supabase
    .from("bms_proposals")
    .select("id")
    .eq("id", proposal_id)
    .eq("building_id", buildingId)
    .maybeSingle();
  if (!prop) throw new Error("Invalid proposal link");

  const { error } = await supabase
    .from("bms_projects")
    .update({ proposal_id })
    .eq("id", project_id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "project.link_proposal",
    entity: "project",
    entity_id: project_id,
    meta: { proposal_id },
  });

  revalidateAll();
  revalidatePath(`/union/projects/${project_id}`);
  revalidatePath(`/admin/projects/${project_id}`);
}

export async function unlinkProposal(project_id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin", "union"]);
  const buildingId = profile.role === "admin"
    ? await getActiveBuilding()
    : profile.building_id;
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_projects")
    .update({ proposal_id: null })
    .eq("id", project_id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "project.unlink_proposal",
    entity: "project",
    entity_id: project_id,
  });

  revalidateAll();
  revalidatePath(`/union/projects/${project_id}`);
  revalidatePath(`/admin/projects/${project_id}`);
}
