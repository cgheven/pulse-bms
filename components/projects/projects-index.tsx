import Link from "next/link";
import { Coins, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "./project-card";
import { NewProjectDialog } from "./new-project-dialog";
import type { ProjectSummary } from "@/lib/projects";

/**
 * Projects index — used as a server-rendered grid by /admin/projects and
 * /union/projects.
 *
 * Active projects render first (server sort), then closed/cancelled.
 * Empty state ships a friendly Coins illustration + CTA.
 */
export function ProjectsIndex({
  projects,
  proposals,
  totalFlats,
  baseHref,
  canCreate,
}: {
  projects: ProjectSummary[];
  proposals: Array<{ id: string; title: string }>;
  totalFlats: number;
  /** "/admin/projects" or "/union/projects" — used to build detail links. */
  baseHref: string;
  /** Hides the "New Project" button when caller is resident. */
  canCreate: boolean;
}) {
  const active = projects.filter((p) => p.status === "active");
  const inactive = projects.filter((p) => p.status !== "active");

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Project Funds
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track community-led collections for one-off projects.
          </p>
        </div>
        {canCreate && (
          <NewProjectDialog
            totalFlats={totalFlats}
            proposals={proposals}
            trigger={
              <Button className="btn-big">
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            }
          />
        )}
      </header>

      {projects.length === 0 ? (
        <EmptyState canCreate={canCreate} totalFlats={totalFlats} proposals={proposals} />
      ) : (
        <>
          {active.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Active ({active.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {active.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    href={`${baseHref}/${p.id}`}
                  />
                ))}
              </div>
            </section>
          )}

          {inactive.length > 0 && (
            <section className="space-y-3 pt-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Past projects ({inactive.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {inactive.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    href={`${baseHref}/${p.id}`}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({
  canCreate,
  totalFlats,
  proposals,
}: {
  canCreate: boolean;
  totalFlats: number;
  proposals: Array<{ id: string; title: string }>;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-gradient-to-br from-card via-card to-secondary/30 p-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
        <Coins className="h-8 w-8 text-primary" />
      </div>
      <h3 className="mt-4 text-xl font-semibold">Start your first project</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
        Run transparent fundraising drives for solar, lifts, painting, Eid
        relief and more — without WhatsApp ledger chaos.
      </p>
      {canCreate && (
        <div className="mt-5">
          <NewProjectDialog
            totalFlats={totalFlats}
            proposals={proposals}
            trigger={
              <Button className="btn-big">
                <Plus className="h-4 w-4" />
                Start your first project
              </Button>
            }
          />
        </div>
      )}
      {!canCreate && (
        <p className="mt-5 text-sm">
          <Link className="text-primary hover:underline" href="/resident">
            Back to home
          </Link>
        </p>
      )}
    </div>
  );
}
