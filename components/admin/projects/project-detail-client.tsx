"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  CalendarDays,
  Sparkles,
  HandCoins,
  ListChecks,
  AlertTriangle,
  Info,
  MessageCircle,
  Receipt,
  X,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { formatCurrency, formatDate, formatLakh, cn } from "@/lib/utils";
import { toIntlNoPlus } from "@/lib/phone";
import { ProjectProgressBar } from "@/components/projects/progress-bar";
import {
  RecordPaymentDialog,
  type FlatPickerOption,
} from "@/components/admin/payments/record-payment-dialog";
import { PaymentsList, type PaymentRow } from "@/components/admin/payments/payments-list";
import {
  closeProject,
  cancelProject,
  reopenProject,
  updateProject,
  syncProjectShares,
} from "@/app/actions/projects";
import type {
  ProjectSummary,
  FlatStanding,
  ContributionRow,
} from "@/lib/projects";

/**
 * Project detail client — shared between /admin/projects/[id] and
 * /union/projects/[id].
 *
 * Caller passes `baseHref` so the back link + Edit/Close redirects point at
 * the right role surface. `canManage` gates the action buttons (record /
 * edit / close / cancel) so resident-style read-only renders are possible
 * later without forking this component.
 */
export function ProjectDetailClient({
  project,
  standings,
  contributions,
  flats,
  buildingName,
  buildingId,
  baseHref,
  proposalTitle,
  createdByName,
  canManage,
  missingSharesCount = 0,
}: {
  project: ProjectSummary;
  standings: FlatStanding[];
  contributions: ContributionRow[];
  flats: FlatPickerOption[];
  buildingName: string;
  buildingId: string;
  /** "/admin/projects" or "/union/projects" */
  baseHref: string;
  proposalTitle: string | null;
  createdByName: string | null;
  /** admin / super_admin / union can manage. Resident view sets this false. */
  canManage: boolean;
  /**
   * Number of active flats in the building that don't yet have a share
   * row for this project. Drives the "Sync shares" button in the About
   * tab — equal-rule projects only. Server computes; client renders.
   */
  missingSharesCount?: number;
}) {
  type Tab = "contributors" | "recent" | "defaulters" | "about";
  const [tab, setTab] = useState<Tab>("contributors");
  const [recordOpen, setRecordOpen] = useState(false);
  const [presetFlatId, setPresetFlatId] = useState<string | null>(null);
  const [presetAmountDue, setPresetAmountDue] = useState<number | undefined>();

  const isVoluntary = project.contribution_rule === "voluntary";
  const isClosedOrCancelled =
    project.status === "closed" || project.status === "cancelled";

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

  const contributorsCountLabel = isVoluntary
    ? `${project.contributors}`
    : `${project.contributors} of ${project.total_flats}`;

  const daysLabel =
    project.status === "cancelled"
      ? "Cancelled"
      : project.status === "closed"
      ? "Closed"
      : project.days_remaining == null
      ? "No deadline"
      : project.days_remaining < 0
      ? "Past deadline"
      : `${project.days_remaining} days`;

  // Convert detail-page contribution rows to PaymentsList-compatible shape so
  // we can reuse the existing component for "Recent contributions".
  const paymentRows: PaymentRow[] = useMemo(
    () =>
      contributions.map((c) => ({
        id: c.id,
        payment_date: c.payment_date,
        flat_id: c.flat_id,
        flat_number: c.flat_number,
        resident_name: c.resident_name,
        amount: c.amount,
        payment_mode: c.payment_mode,
        category: "project",
        receipt_no: c.receipt_no,
        recorded_by_name: null,
        reference_no: null,
        invoice_id: null,
        invoice_number: null,
        billing_month: null,
        received_by_name:
          c.received_by?.split(" (")[0] ?? null,
        received_by_position:
          c.received_by?.match(/\(([^)]+)\)$/)?.[1] ?? null,
      })),
    [contributions],
  );

  const openRecordForFlat = (flatId: string, amountDue: number | undefined) => {
    setPresetFlatId(flatId);
    setPresetAmountDue(amountDue);
    setRecordOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Back */}
      <Link
        href={baseHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to projects
      </Link>

      {/* Hero */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-secondary/30 p-5 sm:p-6 shadow-lg space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary border border-primary/20">
                <Sparkles className="h-3 w-3" />
                {project.contribution_rule === "equal"
                  ? "Equal split"
                  : project.contribution_rule === "custom"
                  ? "Custom shares"
                  : "Voluntary"}
              </span>
              <StatusPill status={project.status} />
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              {project.name}
            </h1>
            {project.description && (
              <p className="text-muted-foreground text-sm mt-2 max-w-2xl">
                {project.description}
              </p>
            )}
          </div>
          {canManage && !isClosedOrCancelled && (
            <div className="flex flex-wrap gap-2">
              <Button
                className="btn-big"
                onClick={() => openRecordForFlat("", undefined)}
              >
                <HandCoins className="h-4 w-4" />
                Record Contribution
              </Button>
              <EditProjectButton
                project={project}
                onSaved={() => undefined}
              />
              <StatusButton
                project={project}
                action="close"
                label="Close project"
                variant="outline"
              />
              <StatusButton
                project={project}
                action="cancel"
                label="Cancel project"
                variant="destructive-outline"
              />
            </div>
          )}
          {canManage && isClosedOrCancelled && (
            <div className="flex flex-wrap gap-2">
              <StatusButton
                project={project}
                action="reopen"
                label="Reopen"
                variant="outline"
              />
            </div>
          )}
        </header>

        {/* Big progress bar */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-3xl font-bold tracking-tight tabular-nums">
              {collectedLabel}
            </span>
            <span className="text-sm text-muted-foreground">
              of {targetLabel}
            </span>
          </div>
          <ProjectProgressBar
            progress={project.progress}
            size="lg"
            status={project.status}
          />
        </div>

        {/* KPIs */}
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile label="Target" value={targetLabel} />
          <KpiTile label="Collected" value={collectedLabel} />
          <KpiTile
            label="Contributors"
            value={contributorsCountLabel}
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
          />
          <KpiTile
            label="Time"
            value={daysLabel}
            icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
          />
        </dl>
      </div>

      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Project sections"
        className="inline-flex items-center gap-1 rounded-lg bg-muted p-1 border border-border overflow-x-auto"
      >
        <TabButton
          active={tab === "contributors"}
          onClick={() => setTab("contributors")}
          icon={ListChecks}
          label={isVoluntary ? "Contributions" : "Contributors"}
        />
        <TabButton
          active={tab === "recent"}
          onClick={() => setTab("recent")}
          icon={Receipt}
          label="Recent"
        />
        {!isVoluntary && (
          <TabButton
            active={tab === "defaulters"}
            onClick={() => setTab("defaulters")}
            icon={AlertTriangle}
            label="Defaulters"
          />
        )}
        <TabButton
          active={tab === "about"}
          onClick={() => setTab("about")}
          icon={Info}
          label="About"
        />
      </div>

      {/* Panels */}
      <div role="tabpanel" hidden={tab !== "contributors"}>
        <ContributorsPanel
          standings={standings}
          isVoluntary={isVoluntary}
          buildingName={buildingName}
          project={project}
          canManage={canManage && !isClosedOrCancelled}
          onRecord={openRecordForFlat}
        />
      </div>
      <div role="tabpanel" hidden={tab !== "recent"}>
        <div className="card-soft">
          {contributions.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">
              No contributions recorded yet.
            </p>
          ) : (
            <PaymentsList
              payments={paymentRows}
              buildingName={buildingName}
              buildingId={buildingId}
            />
          )}
        </div>
      </div>
      {!isVoluntary && (
        <div role="tabpanel" hidden={tab !== "defaulters"}>
          <DefaultersPanel
            standings={standings}
            buildingName={buildingName}
            project={project}
            canManage={canManage && !isClosedOrCancelled}
            onRecord={openRecordForFlat}
          />
        </div>
      )}
      <div role="tabpanel" hidden={tab !== "about"}>
        <AboutPanel
          project={project}
          proposalTitle={proposalTitle}
          createdByName={createdByName}
          canManage={canManage && !isClosedOrCancelled}
          missingSharesCount={missingSharesCount}
        />
      </div>

      {/* Record payment dialog — controlled so per-row [Record] can pre-pick a flat */}
      {canManage && !isClosedOrCancelled && (
        <RecordPaymentDialog
          open={recordOpen}
          onOpenChange={(o) => {
            setRecordOpen(o);
            if (!o) {
              setPresetFlatId(null);
              setPresetAmountDue(undefined);
            }
          }}
          flats={
            presetFlatId
              ? flats.map((f) =>
                  f.id === presetFlatId
                    ? { ...f }
                    : f,
                )
              : flats
          }
          buildingName={buildingName}
          buildingId={buildingId}
          defaultCategory="project"
          presetProject={{
            id: project.id,
            name: project.name,
            amount_due: presetAmountDue,
          }}
        />
      )}
    </div>
  );
}

// ─── Hero pieces ──────────────────────────────────────────────────────────

function StatusPill({
  status,
}: {
  status: "active" | "closed" | "cancelled";
}) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-[hsl(38_92%_55%/0.15)] text-[hsl(38_92%_55%)] border border-[hsl(38_92%_55%/0.3)]">
        Active
      </span>
    );
  }
  if (status === "closed") {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-[hsl(151_70%_45%/0.15)] text-[hsl(151_70%_45%)] border border-[hsl(151_70%_45%/0.3)]">
        Closed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
      Cancelled
    </span>
  );
}

function KpiTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 flex items-center gap-1.5 text-lg font-bold tabular-nums tracking-tight">
        {icon}
        {value}
      </dd>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Sparkles;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

// ─── Contributors / Defaulters panels ─────────────────────────────────────

type ChipFilter = "all" | "paid" | "partial" | "pending";

function ContributorsPanel({
  standings,
  isVoluntary,
  buildingName,
  project,
  canManage,
  onRecord,
}: {
  standings: FlatStanding[];
  isVoluntary: boolean;
  buildingName: string;
  project: ProjectSummary;
  canManage: boolean;
  onRecord: (flatId: string, amountDue: number | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<ChipFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return standings.filter((s) => {
      if (!isVoluntary && chip !== "all" && s.status !== chip) return false;
      if (!q) return true;
      return (
        s.flat_number.toLowerCase().includes(q) ||
        (s.resident_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [standings, chip, query, isVoluntary]);

  if (standings.length === 0) {
    return (
      <div className="card-soft text-center py-10">
        <p className="text-muted-foreground text-sm">
          {isVoluntary
            ? "No contributions yet. Record the first one to kick things off."
            : "No contributor rows. Seed the share table from the project actions menu."}
        </p>
      </div>
    );
  }

  return (
    <div className="card-soft space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {!isVoluntary && (
          <div className="inline-flex gap-1 rounded-md bg-muted p-1 shrink-0">
            <FilterChip active={chip === "all"} onClick={() => setChip("all")}>
              All
            </FilterChip>
            <FilterChip active={chip === "paid"} onClick={() => setChip("paid")}>
              Paid
            </FilterChip>
            <FilterChip
              active={chip === "partial"}
              onClick={() => setChip("partial")}
            >
              Partial
            </FilterChip>
            <FilterChip
              active={chip === "pending"}
              onClick={() => setChip("pending")}
            >
              Pending
            </FilterChip>
          </div>
        )}
        <Input
          placeholder="Search by flat or resident"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="text-left border-b border-border">
              <th className="px-4 sm:px-2 py-2 font-medium">Flat</th>
              <th className="px-4 sm:px-2 py-2 font-medium hidden md:table-cell">
                Resident
              </th>
              {!isVoluntary && (
                <th className="px-4 sm:px-2 py-2 font-medium text-right">
                  Expected
                </th>
              )}
              <th className="px-4 sm:px-2 py-2 font-medium text-right">Paid</th>
              <th className="px-4 sm:px-2 py-2 font-medium">Status</th>
              {canManage && (
                <th className="px-4 sm:px-2 py-2 font-medium text-right">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={canManage ? 6 : 5}
                  className="px-4 py-6 text-center text-muted-foreground text-sm"
                >
                  No rows match this filter.
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <ContributorRow
                key={s.flat_id}
                row={s}
                isVoluntary={isVoluntary}
                buildingName={buildingName}
                project={project}
                canManage={canManage}
                onRecord={onRecord}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContributorRow({
  row,
  isVoluntary,
  buildingName,
  project,
  canManage,
  onRecord,
}: {
  row: FlatStanding;
  isVoluntary: boolean;
  buildingName: string;
  project: ProjectSummary;
  canManage: boolean;
  onRecord: (flatId: string, amountDue: number | undefined) => void;
}) {
  const due = Math.max(0, row.expected - row.paid);
  const cleared = row.status === "paid";
  const intl = toIntlNoPlus(row.resident_phone);
  const waText = waReminder({
    residentName: row.resident_name,
    projectName: project.name,
    target: project.target_amount,
    collected: project.collected,
    due,
    buildingName,
  });
  const waHref = intl
    ? `https://wa.me/${intl}?text=${encodeURIComponent(waText)}`
    : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 sm:px-2 py-3 align-top">
        <div className="font-semibold">{row.flat_number}</div>
        <div className="md:hidden text-xs text-muted-foreground mt-0.5">
          {row.resident_name ?? "—"}
        </div>
      </td>
      <td className="px-4 sm:px-2 py-3 align-top hidden md:table-cell text-muted-foreground">
        {row.resident_name ?? "—"}
      </td>
      {!isVoluntary && (
        <td className="px-4 sm:px-2 py-3 align-top text-right tabular-nums">
          {formatCurrency(row.expected)}
        </td>
      )}
      <td className="px-4 sm:px-2 py-3 align-top text-right tabular-nums font-medium">
        {formatCurrency(row.paid)}
      </td>
      <td className="px-4 sm:px-2 py-3 align-top">
        {isVoluntary || cleared ? (
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-[hsl(151_70%_45%/0.15)] text-[hsl(151_70%_45%)] border border-[hsl(151_70%_45%/0.3)]">
            Cleared ✓
          </span>
        ) : (
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-destructive/10 text-destructive border border-destructive/30">
            {formatCurrency(due)} due
          </span>
        )}
      </td>
      {canManage && (
        <td className="px-4 sm:px-2 py-3 align-top">
          <div className="flex flex-col sm:flex-row gap-1.5 justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRecord(row.flat_id, due > 0 ? due : undefined)}
            >
              <Receipt className="h-3.5 w-3.5" />
              Record
            </Button>
            {!isVoluntary && !cleared && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[hsl(151_70%_28%)] hover:bg-[hsl(151_70%_24%)] transition"
                title={
                  intl
                    ? `Send reminder to ${row.resident_name ?? "resident"}`
                    : "No phone — opens WhatsApp blank"
                }
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </a>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

function DefaultersPanel({
  standings,
  buildingName,
  project,
  canManage,
  onRecord,
}: {
  standings: FlatStanding[];
  buildingName: string;
  project: ProjectSummary;
  canManage: boolean;
  onRecord: (flatId: string, amountDue: number | undefined) => void;
}) {
  // Anyone with paid < expected (and expected > 0).
  const defaulters = standings.filter(
    (s) => s.expected > 0 && s.paid < s.expected,
  );

  if (defaulters.length === 0) {
    return (
      <div className="card-soft">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-[hsl(151_70%_28%/0.1)] flex items-center justify-center shrink-0">
            <Receipt className="h-5 w-5 text-[hsl(151_70%_28%)]" />
          </div>
          <div>
            <h3 className="font-semibold">All clear — no defaulters</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Every flat has paid its expected share.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalDue = defaulters.reduce(
    (s, d) => s + Math.max(0, d.expected - d.paid),
    0,
  );

  return (
    <div className="card-soft space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <h3 className="font-semibold">Contribution defaulters</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {defaulters.length} {defaulters.length === 1 ? "flat" : "flats"} •{" "}
            {formatCurrency(totalDue)} still due
          </p>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="px-4 sm:px-2 py-2 font-medium">Flat</th>
              <th className="px-4 sm:px-2 py-2 font-medium hidden md:table-cell">
                Resident
              </th>
              <th className="px-4 sm:px-2 py-2 font-medium text-right">
                Still due
              </th>
              {canManage && (
                <th className="px-4 sm:px-2 py-2 font-medium text-right">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {defaulters.map((d) => {
              const due = Math.max(0, d.expected - d.paid);
              const intl = toIntlNoPlus(d.resident_phone);
              const waText = waReminder({
                residentName: d.resident_name,
                projectName: project.name,
                target: project.target_amount,
                collected: project.collected,
                due,
                buildingName,
              });
              const waHref = intl
                ? `https://wa.me/${intl}?text=${encodeURIComponent(waText)}`
                : `https://wa.me/?text=${encodeURIComponent(waText)}`;
              return (
                <tr
                  key={d.flat_id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 sm:px-2 py-3 align-top font-semibold">
                    {d.flat_number}
                    <div className="md:hidden text-xs text-muted-foreground font-normal mt-0.5">
                      {d.resident_name ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 sm:px-2 py-3 align-top hidden md:table-cell text-muted-foreground">
                    {d.resident_name ?? "—"}
                  </td>
                  <td className="px-4 sm:px-2 py-3 align-top text-right">
                    <div className="font-bold text-destructive tabular-nums">
                      {formatCurrency(due)}
                    </div>
                    {d.paid > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Paid {formatCurrency(d.paid)} of{" "}
                        {formatCurrency(d.expected)}
                      </div>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 sm:px-2 py-3 align-top">
                      <div className="flex flex-col sm:flex-row gap-1.5 justify-end">
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[hsl(151_70%_28%)] hover:bg-[hsl(151_70%_24%)] transition"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onRecord(d.flat_id, due)}
                        >
                          <Receipt className="h-3.5 w-3.5" />
                          Record
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded text-sm font-medium transition",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ─── About panel ──────────────────────────────────────────────────────────

function AboutPanel({
  project,
  proposalTitle,
  createdByName,
  canManage,
  missingSharesCount,
}: {
  project: ProjectSummary;
  proposalTitle: string | null;
  createdByName: string | null;
  canManage: boolean;
  missingSharesCount: number;
}) {
  // Only equal-rule projects benefit from the sync — custom shares are
  // operator-managed, voluntary has no share concept. Plus the active gate
  // (canManage already excludes closed/cancelled).
  const showSync =
    canManage &&
    project.contribution_rule === "equal" &&
    missingSharesCount > 0;

  return (
    <div className="card-soft space-y-5">
      {project.description && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            About this project
          </h3>
          <p className="text-sm whitespace-pre-line">{project.description}</p>
        </section>
      )}

      {showSync && (
        <SyncSharesPanel
          projectId={project.id}
          missingSharesCount={missingSharesCount}
        />
      )}

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <AboutRow label="Created by" value={createdByName ?? "—"} />
        <AboutRow
          label="Created on"
          value={formatDate(project.created_at)}
        />
        <AboutRow
          label="Start date"
          value={formatDate(project.start_date)}
        />
        <AboutRow
          label="Deadline"
          value={project.end_date ? formatDate(project.end_date) : "No deadline"}
        />
        <AboutRow
          label="Contribution rule"
          value={
            project.contribution_rule === "equal"
              ? "Equal split"
              : project.contribution_rule === "custom"
              ? "Custom shares"
              : "Voluntary"
          }
        />
        <AboutRow
          label="Default per flat"
          value={
            project.default_per_flat != null
              ? formatCurrency(project.default_per_flat)
              : "—"
          }
        />
        {proposalTitle && (
          <AboutRow
            label="Linked proposal"
            value={
              project.proposal_id ? (
                <Link
                  href={`/union/proposals/${project.proposal_id}`}
                  className="text-primary hover:underline"
                >
                  {proposalTitle}
                </Link>
              ) : (
                proposalTitle
              )
            }
          />
        )}
      </dl>
    </div>
  );
}

function SyncSharesPanel({
  projectId,
  missingSharesCount,
}: {
  projectId: string;
  missingSharesCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      try {
        const res = await syncProjectShares(projectId);
        toast({
          title:
            res.added > 0
              ? `Added ${res.added} flat${res.added === 1 ? "" : "s"}`
              : "Already in sync",
          description:
            res.added > 0
              ? "New share rows seeded with the default per-flat amount."
              : "No flats were missing share rows.",
        });
        router.refresh();
      } catch (err) {
        toast({
          title: "Couldn't sync shares",
          description: friendlyErrorMessage(err, "Try again."),
          variant: "destructive",
        });
      }
    });

  return (
    <section className="rounded-lg border border-border bg-secondary/30 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <h3 className="text-sm font-semibold">Sync per-flat shares</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {missingSharesCount} flat
          {missingSharesCount === 1 ? "" : "s"} added since project start —
          seed share rows so they appear in defaulters &amp; reminders.
        </p>
      </div>
      <Button variant="outline" onClick={run} disabled={pending}>
        {pending
          ? "Syncing…"
          : `Sync shares — ${missingSharesCount} flat${
              missingSharesCount === 1 ? "" : "s"
            }`}
      </Button>
    </section>
  );
}

function AboutRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

// ─── Status / edit buttons ────────────────────────────────────────────────

function StatusButton({
  project,
  action,
  label,
  variant,
}: {
  project: ProjectSummary;
  action: "close" | "cancel" | "reopen";
  label: string;
  variant: "outline" | "destructive-outline";
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const run = () =>
    start(async () => {
      try {
        if (action === "close") await closeProject(project.id);
        else if (action === "cancel") await cancelProject(project.id);
        else await reopenProject(project.id);
        toast({
          title:
            action === "close"
              ? "Project closed"
              : action === "cancel"
              ? "Project cancelled"
              : "Project reopened",
        });
        setConfirmOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Couldn't update project",
          description: friendlyErrorMessage(err, "Try again."),
          variant: "destructive",
        });
      }
    });

  return (
    <>
      <Button
        variant="outline"
        className={cn(
          variant === "destructive-outline" &&
            "border-destructive/40 text-destructive hover:bg-destructive/10",
        )}
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
      >
        {action === "cancel" ? (
          <X className="h-4 w-4" />
        ) : null}
        {label}
      </Button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "close"
                ? `Close ${project.name}?`
                : action === "cancel"
                ? `Cancel ${project.name}?`
                : `Reopen ${project.name}?`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {action === "close"
              ? "Contributions will stop. Past records stay in reports."
              : action === "cancel"
              ? "This will stop collections. The project history stays for transparency."
              : "Contributions will resume from today."}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              Back
            </Button>
            <Button onClick={run} disabled={pending} className="btn-big">
              {pending ? "Saving…" : label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditProjectButton({
  project,
}: {
  project: ProjectSummary;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [target, setTarget] = useState(
    project.target_amount != null ? String(project.target_amount) : "",
  );
  const [endDate, setEndDate] = useState(project.end_date ?? "");
  const [defaultPerFlat, setDefaultPerFlat] = useState(
    project.default_per_flat != null ? String(project.default_per_flat) : "",
  );

  const submit = () =>
    start(async () => {
      try {
        await updateProject(project.id, {
          name,
          description: description || null,
          target_amount: target ? Number(target) : null,
          end_date: endDate || null,
          default_per_flat: defaultPerFlat ? Number(defaultPerFlat) : null,
        });
        toast({ title: "Project updated" });
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Couldn't update",
          description: friendlyErrorMessage(err, "Try again."),
          variant: "destructive",
        });
      }
    });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Target (PKR)</Label>
                <Input
                  type="number"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={
                    project.contribution_rule === "voluntary"
                      ? "Leave blank for open-ended"
                      : ""
                  }
                />
              </div>
              <div>
                <Label>Deadline</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            {project.contribution_rule === "equal" && (
              <div>
                <Label>Default per flat (PKR)</Label>
                <Input
                  type="number"
                  value={defaultPerFlat}
                  onChange={(e) => setDefaultPerFlat(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Note: existing share rows are not retroactively updated.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !name.trim()}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── WhatsApp reminder template ───────────────────────────────────────────

function waReminder({
  residentName,
  projectName,
  target,
  collected,
  due,
  buildingName,
}: {
  residentName: string | null;
  projectName: string;
  target: number | null;
  collected: number;
  due: number;
  buildingName: string;
}): string {
  const greeting = residentName
    ? `Asalam-o-Alaikum ${residentName},`
    : "Asalam-o-Alaikum,";
  const lines: string[] = [greeting, ""];
  lines.push(
    `Aap ki "${projectName}" project contribution ke Rs. ${due.toLocaleString(
      "en-PK",
    )} baqi hain.`,
  );
  if (target != null) {
    lines.push(
      `Project total Rs. ${target.toLocaleString("en-PK")}. Ab tak Rs. ${collected.toLocaleString(
        "en-PK",
      )} jama ho chuka hai.`,
    );
  } else {
    lines.push(
      `Ab tak Rs. ${collected.toLocaleString("en-PK")} jama ho chuka hai.`,
    );
  }
  lines.push("");
  lines.push("Shukriya.");
  lines.push(`— ${buildingName} Union`);
  return lines.join("\n");
}
