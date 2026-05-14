import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatCurrency, formatDate, formatRelative } from "@/lib/utils";
import { StatusPill, type ProposalStatus } from "@/components/union/status-pill";
import { ProposeButton } from "@/components/union/propose-button";
import {
  Receipt,
  UserPlus,
  Wrench,
  ScrollText,
  Sparkles,
  Vote,
  Clock,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

const FILTERS: { value: string; label: string }[] = [
  { value: "all",       label: "All" },
  { value: "pending",   label: "Pending" },
  { value: "approved",  label: "Approved" },
  { value: "executed",  label: "Executed" },
  { value: "rejected",  label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  expense: { label: "Expense", icon: Receipt,    color: "text-[hsl(38_92%_65%)]" },
  hiring:  { label: "Hiring",  icon: UserPlus,   color: "text-[hsl(210_90%_70%)]" },
  repair:  { label: "Repair",  icon: Wrench,     color: "text-[hsl(151_70%_55%)]" },
  policy:  { label: "Policy",  icon: ScrollText, color: "text-foreground" },
  other:   { label: "Other",   icon: Sparkles,   color: "text-muted-foreground" },
};

type ProposalRow = {
  id: string;
  title: string;
  proposal_type: string | null;
  amount: number | string | null;
  voting_rule: string | null;
  status: string | null;
  created_at: string;
  raised_by: string | null;
};

export default async function ProposalsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { profile, user } = await requireRole(["union", "admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Proposals</h1>
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const sp = await searchParams;
  const filter = sp.status ?? "all";
  const buildingId = profile.building_id;
  const supabase = await createClient();

  const [{ data: allProposals }, { data: unionMembers }, { data: myMembership }] =
    await Promise.all([
      supabase
        .from("bms_proposals")
        .select(
          "id, title, proposal_type, amount, voting_rule, status, created_at, raised_by",
        )
        .eq("building_id", buildingId)
        .order("created_at", { ascending: false }),
      supabase
        .from("bms_union_members")
        .select("id, profile_id, is_active")
        .eq("building_id", buildingId)
        .eq("is_active", true),
      supabase
        .from("bms_union_members")
        .select("id")
        .eq("building_id", buildingId)
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  const proposals: ProposalRow[] = (allProposals ?? []) as ProposalRow[];
  const proposalIds = proposals.map((p) => p.id);
  const totalEligible = (unionMembers ?? []).length;
  const myMemberId = myMembership?.id ?? null;

  const userIds = Array.from(
    new Set(proposals.map((p) => p.raised_by).filter(Boolean) as string[]),
  );

  const [{ data: votes }, { data: rfProfiles }] = await Promise.all([
    proposalIds.length > 0
      ? supabase
          .from("bms_proposal_votes")
          .select("proposal_id, union_member_id, vote")
          .in("proposal_id", proposalIds)
      : Promise.resolve({ data: [] as { proposal_id: string; union_member_id: string; vote: string }[] }),
    userIds.length > 0
      ? supabase
          .from("bms_profiles")
          .select("id, full_name, email")
          .in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
  ]);

  const raisedByName = new Map(
    (rfProfiles ?? []).map((p) => [p.id, p.full_name ?? p.email ?? "—"]),
  );

  type VoteTally = {
    approve: number;
    reject: number;
    abstain: number;
    myVote: "approve" | "reject" | "abstain" | null;
  };
  const tally = new Map<string, VoteTally>();
  for (const p of proposals)
    tally.set(p.id, { approve: 0, reject: 0, abstain: 0, myVote: null });
  for (const v of votes ?? []) {
    const bucket = tally.get(v.proposal_id);
    if (!bucket) continue;
    if (v.vote === "approve")      bucket.approve++;
    else if (v.vote === "reject")  bucket.reject++;
    else if (v.vote === "abstain") bucket.abstain++;
    if (myMemberId && v.union_member_id === myMemberId) {
      bucket.myVote = v.vote as "approve" | "reject" | "abstain";
    }
  }

  const counts: Record<string, number> = {
    all: proposals.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    executed: 0,
    cancelled: 0,
  };
  for (const p of proposals) {
    const s = (p.status ?? "pending") as string;
    if (s in counts) counts[s]++;
  }

  const awaitingYou = myMemberId
    ? proposals.filter(
        (p) =>
          p.status === "pending" &&
          (tally.get(p.id)?.myVote ?? null) === null,
      ).length
    : 0;

  const filtered =
    filter === "all" ? proposals : proposals.filter((p) => p.status === filter);

  return (
    <div className="space-y-5 animate-fade-up">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1>Proposals</h1>
          <p className="text-muted-foreground mt-1">
            Vote, comment, and track every committee decision.
          </p>
        </div>
        <ProposeButton
          proposal_type="other"
          buttonLabel="New proposal"
          dialogTitle="Raise a new proposal"
          dialogDescription="Anything that needs a committee vote — policy, hiring, or other."
        />
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Kpi
          label="Total proposals"
          value={proposals.length}
          icon={<Vote className="w-4 h-4" />}
        />
        <Kpi
          label="Pending"
          value={counts.pending}
          icon={<Clock className="w-4 h-4" />}
          tone={counts.pending > 0 ? "warning" : "neutral"}
        />
        <Kpi
          label={myMemberId ? "Awaiting your vote" : "Voting members"}
          value={myMemberId ? awaitingYou : totalEligible}
          icon={myMemberId ? <Vote className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          tone={myMemberId && awaitingYou > 0 ? "danger" : "neutral"}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Filter pills with counts */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          const count = counts[f.value] ?? 0;
          return (
            <Link
              key={f.value}
              href={f.value === "all" ? "/union/proposals" : `/union/proposals?status=${f.value}`}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "tabular-nums text-[10px] px-1.5 py-0.5 rounded-full",
                  active
                    ? "bg-primary-foreground/15 text-primary-foreground"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="card-soft p-0 overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary/60 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium">Votes</th>
                <th className="px-4 py-3 font-medium">Raised by</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <EmptyState filter={filter} canPropose={!!myMemberId} />
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const t = tally.get(p.id) ?? { approve: 0, reject: 0, abstain: 0, myVote: null };
                  const type = TYPE_META[p.proposal_type ?? "other"] ?? TYPE_META.other;
                  const TIcon = type.icon;
                  const amt = p.amount != null ? Number(p.amount) : null;
                  return (
                    <tr
                      key={p.id}
                      className="border-t border-border hover:bg-secondary/40 transition-colors"
                    >
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={`/union/proposals/${p.id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors line-clamp-2 max-w-md"
                        >
                          {p.title}
                        </Link>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDate(p.created_at)} · {formatRelative(p.created_at)}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <TIcon className={cn("w-3.5 h-3.5", type.color)} />
                          <span className="text-foreground">{type.label}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-right tabular-nums text-sm">
                        {amt != null && amt > 0 ? (
                          <span className="text-foreground">{formatCurrency(amt)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top w-[200px]">
                        <VoteProgress
                          tally={t}
                          eligible={totalEligible}
                          status={(p.status ?? "pending") as ProposalStatus}
                        />
                      </td>
                      <td className="px-4 py-3 align-top text-sm">
                        {p.raised_by ? raisedByName.get(p.raised_by) ?? "—" : "—"}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col items-start gap-1.5">
                          <StatusPill status={(p.status ?? "pending") as ProposalStatus} />
                          {myMemberId && t.myVote && (
                            <YourVoteBadge vote={t.myVote} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {filtered.length === 0 ? (
          <div className="card-soft py-10">
            <EmptyState filter={filter} canPropose={!!myMemberId} />
          </div>
        ) : (
          filtered.map((p) => {
            const t = tally.get(p.id) ?? { approve: 0, reject: 0, abstain: 0, myVote: null };
            const type = TYPE_META[p.proposal_type ?? "other"] ?? TYPE_META.other;
            const TIcon = type.icon;
            const amt = p.amount != null ? Number(p.amount) : null;
            return (
              <Link
                key={p.id}
                href={`/union/proposals/${p.id}`}
                className="card-soft card-hover block"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground line-clamp-2">
                      {p.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <TIcon className={cn("w-3 h-3", type.color)} />
                        {type.label}
                      </span>
                      <span>·</span>
                      <span>{formatRelative(p.created_at)}</span>
                    </div>
                  </div>
                  <StatusPill status={(p.status ?? "pending") as ProposalStatus} />
                </div>
                <VoteProgress
                  tally={t}
                  eligible={totalEligible}
                  status={(p.status ?? "pending") as ProposalStatus}
                />
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border text-xs">
                  <span className="text-muted-foreground">
                    {p.raised_by ? raisedByName.get(p.raised_by) ?? "—" : "—"}
                  </span>
                  <div className="flex items-center gap-2">
                    {myMemberId && t.myVote && <YourVoteBadge vote={t.myVote} />}
                    {amt != null && amt > 0 && (
                      <span className="font-semibold text-foreground tabular-nums">
                        {formatCurrency(amt)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "neutral" | "warning" | "danger";
  className?: string;
}) {
  const accent =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-[hsl(38_92%_65%)]"
        : "text-foreground";
  const ring =
    tone === "danger"
      ? "border-destructive/30"
      : tone === "warning"
        ? "border-[hsl(38_92%_55%/0.30)]"
        : "border-border";
  return (
    <div className={cn("card-hover rounded-lg border bg-card p-4", ring, className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className={cn("flex w-8 h-8 items-center justify-center rounded-md bg-primary/10", accent)}>
          {icon}
        </div>
      </div>
      <div className={cn("mt-1.5 text-2xl font-semibold tracking-tight tabular-nums", accent)}>
        {value}
      </div>
    </div>
  );
}

function VoteProgress({
  tally,
  eligible,
  status,
}: {
  tally: { approve: number; reject: number; abstain: number; myVote: string | null };
  eligible: number;
  status: ProposalStatus;
}) {
  const totalVotes = tally.approve + tally.reject + tally.abstain;
  // Show segmented bar based on cast votes; remainder = not voted yet.
  const approvePct = eligible > 0 ? (tally.approve / eligible) * 100 : 0;
  const rejectPct  = eligible > 0 ? (tally.reject  / eligible) * 100 : 0;
  const abstainPct = eligible > 0 ? (tally.abstain / eligible) * 100 : 0;

  const isResolved = status !== "pending";

  return (
    <div className="space-y-1">
      <div
        className={cn(
          "h-1.5 w-full rounded-full overflow-hidden flex bg-secondary/60",
          isResolved && "opacity-60",
        )}
      >
        {tally.approve > 0 && (
          <div className="h-full bg-[hsl(151_70%_55%)]" style={{ width: `${approvePct}%` }} />
        )}
        {tally.reject > 0 && (
          <div className="h-full bg-destructive" style={{ width: `${rejectPct}%` }} />
        )}
        {tally.abstain > 0 && (
          <div className="h-full bg-muted-foreground/60" style={{ width: `${abstainPct}%` }} />
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-[hsl(151_70%_55%)]" />
          {tally.approve}
        </span>
        <span className="inline-flex items-center gap-1">
          <XCircle className="w-3 h-3 text-destructive" />
          {tally.reject}
        </span>
        {tally.abstain > 0 && (
          <span className="inline-flex items-center gap-1">
            <MinusCircle className="w-3 h-3 text-muted-foreground" />
            {tally.abstain}
          </span>
        )}
        <span className="ml-auto">
          {totalVotes} / {eligible}
        </span>
      </div>
    </div>
  );
}

function YourVoteBadge({ vote }: { vote: "approve" | "reject" | "abstain" }) {
  const meta =
    vote === "approve"
      ? { label: "You approved", cls: "bg-[hsl(151_70%_55%/0.12)] text-[hsl(151_70%_55%)] border-[hsl(151_70%_55%/0.30)]" }
      : vote === "reject"
        ? { label: "You rejected", cls: "bg-destructive/15 text-destructive border-destructive/30" }
        : { label: "You abstained", cls: "bg-muted/40 text-muted-foreground border-border" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  );
}

function EmptyState({
  filter,
  canPropose,
}: {
  filter: string;
  canPropose: boolean;
}) {
  if (filter !== "all") {
    return (
      <div className="space-y-1">
        <p className="text-foreground font-medium">Nothing in this view.</p>
        <p className="text-sm text-muted-foreground">
          Try the <Link href="/union/proposals" className="text-primary hover:underline">All</Link> tab.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2 max-w-sm mx-auto">
      <Vote className="w-8 h-8 text-muted-foreground mx-auto" />
      <p className="text-foreground font-medium">No proposals yet.</p>
      <p className="text-sm text-muted-foreground">
        {canPropose
          ? "Raise the first one to start a committee decision."
          : "Once the union raises a proposal, it will show up here."}
      </p>
    </div>
  );
}
