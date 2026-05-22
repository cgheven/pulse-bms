"use client";

import { useState } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  EyeOff,
} from "lucide-react";
import { cn, formatCurrency, formatDate, formatLakh } from "@/lib/utils";
import { ProjectProgressBar } from "@/components/projects/progress-bar";
import { ReceiptButton } from "@/components/resident/receipt-button";
import type { ProjectSummary } from "@/lib/projects";

export type ResidentProjectView = {
  project: ProjectSummary;
  myExpected: number;
  myPaid: number;
  // Contributions this resident's flat has made — shown in the collapsible
  // history block on each card.
  myContributions: Array<{
    id: string;
    receipt_no: string | null;
    payment_date: string | null;
    amount: number;
    payment_mode: string | null;
    invoice_number: string | null;
    billing_month: string | null;
    received_by_name: string | null;
    received_by_position: string | null;
  }>;
};

export function ResidentProjectsClient({
  views,
  exposeDefaulterNames,
  buildingName,
  buildingAddress,
  buildingCity,
  flatNumber,
  residentName,
  contactAdminWaText,
}: {
  views: ResidentProjectView[];
  exposeDefaulterNames: boolean;
  buildingName: string;
  buildingAddress: string | null;
  buildingCity: string | null;
  flatNumber: string;
  residentName: string | null;
  /** Optional fallback wa.me text when the resident doesn't have a flat. */
  contactAdminWaText?: string;
}) {
  const active = views.filter((v) => v.project.status === "active");
  const closed = views.filter((v) => v.project.status !== "active");

  if (views.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-gradient-to-br from-card via-card to-secondary/30 p-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h3 className="mt-4 text-xl font-semibold">No projects right now</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          When your building runs a fundraiser (solar, lift, painting, Eid
          relief), you&apos;ll see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Active ({active.length})
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {active.map((v) => (
              <ResidentProjectCard
                key={v.project.id}
                view={v}
                exposeDefaulterNames={exposeDefaulterNames}
                buildingName={buildingName}
                buildingAddress={buildingAddress}
                buildingCity={buildingCity}
                flatNumber={flatNumber}
                residentName={residentName}
                contactAdminWaText={contactAdminWaText}
              />
            ))}
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <section className="space-y-3 pt-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Past projects ({closed.length})
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {closed.map((v) => (
              <ResidentProjectCard
                key={v.project.id}
                view={v}
                exposeDefaulterNames={exposeDefaulterNames}
                buildingName={buildingName}
                buildingAddress={buildingAddress}
                buildingCity={buildingCity}
                flatNumber={flatNumber}
                residentName={residentName}
                contactAdminWaText={contactAdminWaText}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ResidentProjectCard({
  view,
  exposeDefaulterNames,
  buildingName,
  buildingAddress,
  buildingCity,
  flatNumber,
  residentName,
  contactAdminWaText,
}: {
  view: ResidentProjectView;
  exposeDefaulterNames: boolean;
  buildingName: string;
  buildingAddress: string | null;
  buildingCity: string | null;
  flatNumber: string;
  residentName: string | null;
  contactAdminWaText?: string;
}) {
  const { project, myExpected, myPaid, myContributions } = view;
  const [open, setOpen] = useState(false);

  const isVoluntary = project.contribution_rule === "voluntary";
  const isClosed = project.status !== "active";

  const myDue = Math.max(0, myExpected - myPaid);
  const myProgress =
    myExpected > 0 ? Math.min(1, myPaid / myExpected) : isVoluntary ? null : 0;

  // Per spec: voluntary projects always show community total in detail.
  // Equal/custom projects hide per-flat names if `expose_defaulter_names` is
  // false — but the AGGREGATE total + contributor count stays visible.
  const showCommunityDetail = isVoluntary || exposeDefaulterNames;

  const targetLabel =
    project.target_amount != null
      ? project.target_amount >= 100_000
        ? formatLakh(project.target_amount)
        : formatCurrency(project.target_amount)
      : "Open-ended";
  const collectedLabel =
    project.collected >= 100_000
      ? formatLakh(project.collected)
      : formatCurrency(project.collected);

  const waText = [
    residentName
      ? `Asalam-o-Alaikum, ${residentName} (Flat ${flatNumber})`
      : `Asalam-o-Alaikum, Flat ${flatNumber}`,
    "",
    `Main "${project.name}" project mein contribute karna chahta hun.`,
    myDue > 0
      ? `Meri expected contribution Rs. ${myDue.toLocaleString("en-PK")} hai.`
      : "Cash kahan jama karwana hai please batayein.",
    "",
    "Shukriya.",
  ].join("\n");
  const waHref = `https://wa.me/?text=${encodeURIComponent(
    contactAdminWaText ?? waText,
  )}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lg space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary border border-primary/20">
              <Sparkles className="h-3 w-3" />
              {project.contribution_rule === "equal"
                ? "Equal split"
                : project.contribution_rule === "custom"
                ? "Custom shares"
                : "Voluntary"}
            </span>
            <StatusBadge status={project.status} />
          </div>
          <h3 className="mt-2 text-xl font-bold tracking-tight">
            {project.name}
          </h3>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {project.description}
            </p>
          )}
        </div>
        {!isClosed && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold text-white bg-[hsl(151_70%_28%)] hover:bg-[hsl(151_70%_24%)] transition shrink-0"
          >
            <MessageCircle className="h-4 w-4" />
            Message admin
          </a>
        )}
      </header>

      {/* Personal progress block */}
      <div className="rounded-xl border border-border bg-secondary/30 p-3 sm:p-4 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your contribution
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {isVoluntary
              ? formatCurrency(myPaid)
              : `${formatCurrency(myPaid)} of ${formatCurrency(myExpected)}`}
          </span>
        </div>
        <ProjectProgressBar progress={myProgress} size="md" status={project.status} />
        {!isVoluntary && (
          <p className="text-xs">
            {myDue > 0 ? (
              <span className="text-destructive font-semibold tabular-nums">
                {formatCurrency(myDue)} due
              </span>
            ) : myPaid > 0 ? (
              <span className="text-[hsl(151_70%_45%)] font-semibold">
                Cleared ✓ Thank you for contributing.
              </span>
            ) : (
              <span className="text-muted-foreground">No payment yet.</span>
            )}
          </p>
        )}
      </div>

      {/* Community block */}
      <div className="rounded-xl border border-border bg-secondary/30 p-3 sm:p-4 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Community total
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {collectedLabel} of {targetLabel}
          </span>
        </div>
        <ProjectProgressBar
          progress={project.progress}
          size="md"
          status={project.status}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground gap-3 pt-1">
          <span>
            {project.contributors}{" "}
            {project.contribution_rule === "voluntary"
              ? "contributors"
              : `of ${project.total_flats} flats`}{" "}
            contributing
          </span>
          {!showCommunityDetail && (
            <span className="inline-flex items-center gap-1">
              <EyeOff className="h-3 w-3" />
              Names hidden
            </span>
          )}
        </div>
      </div>

      {/* My contributions */}
      {myContributions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Your contributions ({myContributions.length})
          </button>

          {open && (
            <ul className="mt-3 space-y-2">
              {myContributions.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-border bg-card/60 p-3"
                >
                  <div className="text-sm">
                    <div className="font-semibold tabular-nums">
                      {formatCurrency(p.amount)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.payment_date ? formatDate(p.payment_date) : "—"} ·{" "}
                      {p.payment_mode ?? "—"}
                      {p.receipt_no ? ` · ${p.receipt_no}` : ""}
                    </div>
                  </div>
                  {p.receipt_no && (
                    <ReceiptButton
                      data={{
                        building_name: buildingName,
                        building_address: buildingAddress,
                        building_city: buildingCity,
                        flat_number: flatNumber,
                        resident_name: residentName,
                        receipt_no: p.receipt_no,
                        invoice_number: p.invoice_number,
                        payment_date: p.payment_date,
                        payment_mode: p.payment_mode,
                        category: "Project",
                        billing_month: p.billing_month,
                        amount: p.amount,
                        received_by_name: p.received_by_name,
                        received_by_position: p.received_by_position,
                      }}
                      label="Receipt"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "active" | "closed" | "cancelled";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border",
        status === "active"
          ? "bg-[hsl(38_92%_55%/0.15)] text-[hsl(38_92%_55%)] border-[hsl(38_92%_55%/0.3)]"
          : status === "closed"
          ? "bg-[hsl(151_70%_45%/0.15)] text-[hsl(151_70%_45%)] border-[hsl(151_70%_45%/0.3)]"
          : "bg-muted text-muted-foreground border-border",
      )}
    >
      {status === "active" ? "Active" : status === "closed" ? "Closed" : "Cancelled"}
    </span>
  );
}

