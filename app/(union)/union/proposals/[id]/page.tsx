import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusPill, type ProposalStatus } from "@/components/union/status-pill";
import { VotePanel } from "@/components/union/vote-panel";
import { TallyPanel } from "@/components/union/tally-panel";
import { CommentsThread } from "@/components/union/comments-thread";
import { ExecuteButton } from "@/components/union/execute-button";
import type { VoteChoice } from "@/app/actions/proposals";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  expense: "Expense",
  hiring: "Hiring",
  repair: "Repair",
  policy: "Policy",
  other: "Other",
};

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireRole(["union", "admin", "super_admin"]);
  if (!profile.building_id) notFound();

  const supabase = await createClient();

  const { data: proposal } = await supabase
    .from("bms_proposals")
    .select("*")
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .single();

  if (!proposal) notFound();

  // Active union members count (denominator for tally)
  const { count: totalMembers } = await supabase
    .from("bms_union_members")
    .select("id", { count: "exact", head: true })
    .eq("building_id", profile.building_id)
    .eq("is_active", true);

  // Votes
  const { data: votes } = await supabase
    .from("bms_proposal_votes")
    .select("vote, union_member_id")
    .eq("proposal_id", id);
  const approve = (votes ?? []).filter((v) => v.vote === "approve").length;
  const reject = (votes ?? []).filter((v) => v.vote === "reject").length;
  const abstain = (votes ?? []).filter((v) => v.vote === "abstain").length;

  // Current user's union membership and prior vote
  const { data: myUm } = await supabase
    .from("bms_union_members")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("building_id", profile.building_id)
    .eq("is_active", true)
    .maybeSingle();

  let existingVote: VoteChoice | null = null;
  if (myUm?.id) {
    const found = (votes ?? []).find((v) => v.union_member_id === myUm.id);
    existingVote = (found?.vote as VoteChoice) ?? null;
  }

  // Raised-by name
  let raisedByName: string | null = null;
  if (proposal.raised_by) {
    const { data: prof } = await supabase
      .from("bms_profiles")
      .select("full_name, email")
      .eq("id", proposal.raised_by)
      .single();
    raisedByName = prof?.full_name ?? prof?.email ?? null;
  }

  // Comments
  const { data: rawComments } = await supabase
    .from("bms_proposal_comments")
    .select("id, body, created_at, author_id")
    .eq("proposal_id", id)
    .order("created_at", { ascending: true });

  const commentAuthorIds = Array.from(
    new Set((rawComments ?? []).map((c) => c.author_id).filter(Boolean) as string[])
  );
  let authorNames: Record<string, string> = {};
  if (commentAuthorIds.length > 0) {
    const { data: a } = await supabase
      .from("bms_profiles")
      .select("id, full_name, email")
      .in("id", commentAuthorIds);
    authorNames = Object.fromEntries(
      (a ?? []).map((p) => [p.id, p.full_name ?? p.email ?? "—"])
    );
  }
  const comments = (rawComments ?? []).map((c) => ({
    id: c.id,
    body: c.body,
    created_at: c.created_at,
    author_name: c.author_id ? authorNames[c.author_id] ?? null : null,
  }));

  const votingRule = (proposal.voting_rule ?? "majority") as "majority" | "unanimous";
  const canVote = !!myUm?.id;
  const canExecute =
    proposal.status === "approved" &&
    (profile.role === "admin" || profile.role === "super_admin");

  return (
    <div className="space-y-6 animate-fade-up">
      <Link
        href="/union/proposals"
        className="inline-flex items-center gap-2 text-primary font-medium hover:underline"
      >
        <ArrowLeft className="w-4 h-4" />
        All proposals
      </Link>

      <div className="card-soft">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm uppercase tracking-wide text-muted-foreground font-semibold">
              {TYPE_LABEL[proposal.proposal_type ?? "other"]}
            </div>
            <h1 className="mt-1">{proposal.title}</h1>
            <div className="text-muted-foreground mt-2 text-base">
              Raised by <span className="font-semibold text-foreground">{raisedByName ?? "—"}</span>{" "}
              · {formatDate(proposal.created_at)}
              {proposal.amount ? (
                <>
                  {" "}
                  · Amount{" "}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(Number(proposal.amount))}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <StatusPill status={(proposal.status ?? "pending") as ProposalStatus} />
            {proposal.executed_at && (
              <span className="text-xs text-muted-foreground">
                Executed {formatDate(proposal.executed_at)}
              </span>
            )}
          </div>
        </div>

        {proposal.description && (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-lg font-bold mb-2">Details</h3>
            <p className="whitespace-pre-wrap text-base leading-relaxed">{proposal.description}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <VotePanel
          proposalId={id}
          existingVote={existingVote}
          canVote={canVote}
          proposalStatus={proposal.status ?? "pending"}
        />
        <TallyPanel
          approve={approve}
          reject={reject}
          abstain={abstain}
          total={totalMembers ?? 0}
          votingRule={votingRule}
        />
      </div>

      {canExecute && (
        <div className="card-soft border-2 border-blue-200 bg-blue-50">
          <h3 className="text-xl font-bold mb-2">Ready to execute</h3>
          <p className="text-muted-foreground mb-4">
            This proposal has been approved by the committee. Execute it to record the action.
            {proposal.proposal_type === "expense" && proposal.amount
              ? " A matching expense will be created automatically."
              : ""}
          </p>
          <ExecuteButton proposalId={id} />
        </div>
      )}

      <CommentsThread proposalId={id} comments={comments} />
    </div>
  );
}
