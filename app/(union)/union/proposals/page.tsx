import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusPill, type ProposalStatus } from "@/components/union/status-pill";
import { ProposeButton } from "@/components/union/propose-button";

export const dynamic = "force-dynamic";

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "executed", label: "Executed" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_LABEL: Record<string, string> = {
  expense: "Expense",
  hiring: "Hiring",
  repair: "Repair",
  policy: "Policy",
  other: "Other",
};

export default async function ProposalsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { profile } = await requireRole("union");
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Proposals</h1>
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const sp = await searchParams;
  const status = sp.status ?? "all";

  const supabase = await createClient();
  let query = supabase
    .from("bms_proposals")
    .select("id, title, proposal_type, amount, status, created_at, raised_by")
    .eq("building_id", profile.building_id)
    .order("created_at", { ascending: false });
  if (status !== "all") query = query.eq("status", status);

  const { data: proposals } = await query;

  // Fetch raised_by names
  const userIds = Array.from(new Set((proposals ?? []).map((p) => p.raised_by).filter(Boolean) as string[]));
  let names: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from("bms_profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    names = Object.fromEntries(
      (profs ?? []).map((p) => [p.id, p.full_name ?? p.email ?? "—"])
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
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

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => {
          const active = status === f.value;
          return (
            <Link
              key={f.value}
              href={f.value === "all" ? "/union/proposals" : `/union/proposals?status=${f.value}`}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white hover:bg-secondary border-border text-foreground"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="card-soft p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-secondary text-sm uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Raised by</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(proposals ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No proposals in this view.
                </td>
              </tr>
            ) : (
              (proposals ?? []).map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-secondary/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/union/proposals/${p.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">{TYPE_LABEL[p.proposal_type ?? "other"]}</td>
                  <td className="px-4 py-3 text-sm">
                    {p.amount ? formatCurrency(Number(p.amount)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {p.raised_by ? names[p.raised_by] ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">{formatDate(p.created_at)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={(p.status ?? "pending") as ProposalStatus} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
