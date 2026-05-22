import Link from "next/link";
import { CalendarDays, Users, Sparkles } from "lucide-react";
import { formatCurrency, formatLakh } from "@/lib/utils";
import { ProjectProgressBar } from "./progress-bar";
import type { ProjectSummary } from "@/lib/projects";

/**
 * Project card used on the index page (admin / union / resident).
 *
 * Two display modes:
 *  - withActions: shows the "View details →" affordance + role-aware href
 *  - read-only:   same card minus the action, for resident summary tiles
 *
 * Premium feel: large padding, hover lift (matches CSS `card-hover`), big
 * progress bar, generous typography. We deliberately omit "Partial /
 * Pending" plain text — status comes through the bar gradient + KPIs.
 */
export function ProjectCard({
  project,
  href,
  showActions = true,
}: {
  project: ProjectSummary;
  /** Where "View details" links to. Caller picks the role-aware URL. */
  href: string;
  showActions?: boolean;
}) {
  const target = project.target_amount ?? null;
  const targetLabel =
    target != null
      ? target >= 100_000
        ? formatLakh(target)
        : formatCurrency(target)
      : "Open-ended";
  const collectedLabel =
    project.collected >= 100_000
      ? formatLakh(project.collected)
      : formatCurrency(project.collected);

  const ruleBadge =
    project.contribution_rule === "equal"
      ? "Equal split"
      : project.contribution_rule === "custom"
      ? "Custom shares"
      : "Voluntary";

  const isClosed = project.status === "closed";
  const isCancelled = project.status === "cancelled";

  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-lg transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_30px_-12px_hsl(38_92%_55%/0.25)]"
    >
      {/* Header row: name + status pill */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary border border-primary/20">
              <Sparkles className="h-3 w-3" />
              {ruleBadge}
            </span>
            <StatusPill status={project.status} />
          </div>
          <h3 className="mt-2 text-lg font-bold tracking-tight line-clamp-1">
            {project.name}
          </h3>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
              {project.description}
            </p>
          )}
        </div>
      </header>

      {/* Progress hero */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-2xl font-bold tracking-tight tabular-nums">
            {collectedLabel}
          </span>
          <span className="text-xs text-muted-foreground">
            of {targetLabel}
          </span>
        </div>
        <ProjectProgressBar
          progress={project.progress}
          size="md"
          status={project.status}
        />
      </div>

      {/* Stats row */}
      <dl className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Contributors</dt>
          <dd className="mt-0.5 flex items-center gap-1 font-semibold tabular-nums">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {project.contributors}
            {project.contribution_rule !== "voluntary" && (
              <span className="text-muted-foreground font-normal">
                /{project.total_flats}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pending</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {project.contribution_rule === "voluntary"
              ? "—"
              : project.pending}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Time</dt>
          <dd className="mt-0.5 flex items-center gap-1 font-semibold tabular-nums">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            {isCancelled
              ? "Cancelled"
              : isClosed
              ? "Closed"
              : project.days_remaining == null
              ? "Open"
              : project.days_remaining < 0
              ? "Past deadline"
              : `${project.days_remaining}d left`}
          </dd>
        </div>
      </dl>

      {showActions && (
        <p className="mt-1 text-sm font-medium text-primary group-hover:translate-x-0.5 transition-transform">
          View details →
        </p>
      )}
    </Link>
  );
}

function StatusPill({ status }: { status: "active" | "closed" | "cancelled" }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider status-active">
        Active
      </span>
    );
  }
  if (status === "closed") {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider status-paid">
        Closed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider status-expired">
      Cancelled
    </span>
  );
}
