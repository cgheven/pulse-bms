"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { revalidatePath } from "next/cache";

export type ProposalType = "expense" | "hiring" | "repair" | "policy" | "other";
export type VotingRule = "majority" | "unanimous";
export type VoteChoice = "approve" | "reject" | "abstain";

/* ────────────────────────────────────────────────────────────────────────────
 * Proposals — create
 * ────────────────────────────────────────────────────────────────────────── */

export async function createProposal(input: {
  title: string;
  description?: string;
  proposal_type: ProposalType;
  amount?: number | null;
  voting_rule?: VotingRule;
}) {
  await requireNotDemo();
  const { user, profile } = await requireRole(["union", "admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();

  // Default voting rule from building if not provided.
  let voting_rule = input.voting_rule;
  if (!voting_rule) {
    const { data: b } = await supabase
      .from("bms_buildings")
      .select("voting_rule")
      .eq("id", profile.building_id)
      .single();
    voting_rule = (b?.voting_rule as VotingRule) ?? "majority";
  }

  const { data, error } = await supabase
    .from("bms_proposals")
    .insert({
      building_id: profile.building_id,
      title: input.title,
      description: input.description ?? null,
      proposal_type: input.proposal_type,
      amount: input.amount ?? null,
      voting_rule,
      status: "pending",
      raised_by: user.id,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "proposal.create",
    entity: "proposal",
    entity_id: data.id,
    meta: { proposal_type: input.proposal_type, amount: input.amount ?? null },
  });

  revalidatePath("/union/proposals");
  return data;
}

export async function cancelProposal(id: string) {
  await requireNotDemo();
  const { user, profile } = await requireRole(["union", "admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bms_proposals")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("building_id", profile.building_id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "proposal.cancel",
    entity: "proposal",
    entity_id: id,
  });
  revalidatePath("/union/proposals");
  revalidatePath(`/union/proposals/${id}`);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Recompute proposal status from votes
 * ────────────────────────────────────────────────────────────────────────── */

async function recomputeProposalStatus(proposal_id: string) {
  const supabase = await createClient();

  const { data: prop } = await supabase
    .from("bms_proposals")
    .select("id, building_id, voting_rule, status")
    .eq("id", proposal_id)
    .single();
  if (!prop) return;

  // Skip if already finalized.
  if (prop.status !== "pending") return;

  // Active union members in this building = total voters.
  const { count: totalCount } = await supabase
    .from("bms_union_members")
    .select("id", { count: "exact", head: true })
    .eq("building_id", prop.building_id)
    .eq("is_active", true);
  const total = totalCount ?? 0;
  if (total === 0) return;

  const { data: votes } = await supabase
    .from("bms_proposal_votes")
    .select("vote")
    .eq("proposal_id", proposal_id);

  const approve = (votes ?? []).filter((v) => v.vote === "approve").length;
  const reject = (votes ?? []).filter((v) => v.vote === "reject").length;

  let next: "pending" | "approved" | "rejected" = "pending";

  if (prop.voting_rule === "unanimous") {
    if (reject > 0) next = "rejected";
    else if (approve >= total) next = "approved";
  } else {
    // majority (default) — strict majority required; ties stay pending.
    if (approve > total / 2) next = "approved";
    else if (reject > total / 2) next = "rejected";
  }

  if (next !== "pending") {
    await supabase
      .from("bms_proposals")
      .update({ status: next })
      .eq("id", proposal_id);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Cast vote
 * ────────────────────────────────────────────────────────────────────────── */

export async function castVote(
  proposal_id: string,
  vote: VoteChoice,
  comment?: string
) {
  await requireNotDemo();
  const { user, profile } = await requireRole("union");
  if (!profile.building_id) throw new Error("No building assigned");

  const supabase = await createClient();

  const { data: um, error: umErr } = await supabase
    .from("bms_union_members")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("building_id", profile.building_id)
    .eq("is_active", true)
    .maybeSingle();
  if (umErr) throw new Error(umErr.message);
  if (!um) throw new Error("Not an active union member");

  // Guard: only accept votes on proposals that are still open (BUG-003).
  const { data: prop } = await supabase
    .from("bms_proposals")
    .select("status")
    .eq("id", proposal_id)
    .eq("building_id", profile.building_id)
    .maybeSingle();
  if (!prop) throw new Error("Proposal not found.");
  if (prop.status !== "pending") throw new Error("Voting is closed for this proposal.");

  // Prevent double-voting: each union member may cast exactly one vote per proposal.
  const { data: existingVote } = await supabase
    .from("bms_proposal_votes")
    .select("id")
    .eq("proposal_id", proposal_id)
    .eq("union_member_id", um.id)
    .maybeSingle();
  if (existingVote) throw new Error("You have already voted on this proposal.");

  const { data, error } = await supabase
    .from("bms_proposal_votes")
    .insert({
      proposal_id,
      union_member_id: um.id,
      vote,
      comment: comment ?? null,
      building_id: profile.building_id,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await recomputeProposalStatus(proposal_id);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "proposal.vote",
    entity: "proposal",
    entity_id: proposal_id,
    meta: { vote, comment: comment ?? null },
  });

  revalidatePath(`/union/proposals/${proposal_id}`);
  revalidatePath("/union/proposals");
  revalidatePath("/union");
  return data;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Comments
 * ────────────────────────────────────────────────────────────────────────── */

export async function addProposalComment(proposal_id: string, body: string) {
  await requireNotDemo();
  const { user, profile } = await requireRole(["union", "admin", "super_admin"]);
  if (!profile.building_id) throw new Error("No building assigned");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Comment cannot be empty");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bms_proposal_comments")
    .insert({
      proposal_id,
      building_id: profile.building_id,
      author_id: user.id,
      body: trimmed,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: profile.building_id,
    action: "proposal.comment",
    entity: "proposal",
    entity_id: proposal_id,
  });

  revalidatePath(`/union/proposals/${proposal_id}`);
  return data;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Execute an approved proposal
 * ────────────────────────────────────────────────────────────────────────── */

export async function executeProposal(id: string) {
  await requireNotDemo();
  const { user, profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();

  const { data: prop, error: fetchErr } = await supabase
    .from("bms_proposals")
    .select("*")
    .eq("id", id)
    .eq("building_id", buildingId)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);
  if (prop.status !== "approved") {
    throw new Error("Only approved proposals can be executed");
  }

  let linked_expense_id: string | null = null;

  // Map proposal_type → bms_expenses.category (CHECK: utilities|repairs|salaries|supplies|other).
  // NOTE: hiring/policy proposals do NOT create an expense — they're decisions.
  // Hiring's actual cost flows through /admin/staff (bms_salary_payments) once
  // the staff member is created. Policy proposals have no monetary side effect.
  const categoryFor: Record<string, string> = {
    expense: "other",
    repair:  "repairs",
    other:   "other",
  };

  // Only expense/repair/other proposals roll up into bms_expenses on execution.
  const createsExpense =
    prop.proposal_type !== "policy" &&
    prop.proposal_type !== "hiring" &&
    !!prop.amount;

  if (createsExpense) {
    const category = categoryFor[prop.proposal_type as string] ?? "other";
    const { data: exp, error: expErr } = await supabase
      .from("bms_expenses")
      .insert({
        building_id: buildingId,
        category,
        subcategory: prop.proposal_type,
        description: prop.title,
        amount: prop.amount,
        expense_date: new Date().toISOString().slice(0, 10),
        proposal_id: prop.id,
        recorded_by: user.id,
      })
      .select()
      .single();
    if (expErr) throw new Error(`Failed to record expense: ${expErr.message}`);
    linked_expense_id = exp.id;
  }

  const updatePayload: Record<string, unknown> = {
    status: "executed",
    executed_at: new Date().toISOString(),
  };
  if (linked_expense_id) updatePayload.expense_id = linked_expense_id;

  const { error: updErr } = await supabase
    .from("bms_proposals")
    .update(updatePayload)
    .eq("id", id);
  if (updErr) throw new Error(updErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "proposal.execute",
    entity: "proposal",
    entity_id: id,
    meta: { expense_id: linked_expense_id },
  });

  revalidatePath("/union/proposals");
  revalidatePath(`/union/proposals/${id}`);
  revalidatePath("/union/expenses");
  revalidatePath("/admin/union");
}
