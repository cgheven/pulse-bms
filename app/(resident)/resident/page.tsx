import Link from "next/link";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatRelative } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DuesPill } from "@/components/resident/dues-pill";
import { KpiRowSkeleton } from "@/components/layout/table-skeleton";
import {
  ArrowRight,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Megaphone,
  Pin,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ResidentHomePage() {
  // requireRole hits the cached session — header renders without waiting on DB.
  const { profile } = await requireRole("resident");
  const firstName = (profile.full_name ?? profile.email ?? "Resident").split(/\s+/)[0];

  return (
    <div className="space-y-5 animate-fade-up max-w-4xl">
      <header>
        <h1>Hello, {firstName}</h1>
        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground mt-1 h-5">&nbsp;</p>
          }
        >
          <HeaderSubtitle profileId={profile.id} buildingId={profile.building_id} />
        </Suspense>
      </header>

      <Suspense fallback={<HeroSkeleton />}>
        <DuesHero profileId={profile.id} buildingId={profile.building_id} />
      </Suspense>

      {/* Featured: building services marketplace — our differentiator.
          Surfaced on home so every resident sees it on first open. */}
      <Link
        href="/resident/services"
        className="group block rounded-xl border border-primary/30 bg-gradient-to-br from-primary/12 via-card to-card p-4 sm:p-5 hover:border-primary/50 hover:from-primary/15 transition-colors"
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex w-10 h-10 sm:w-12 sm:h-12 items-center justify-center rounded-lg bg-primary/20 border border-primary/30 text-primary shrink-0">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold tracking-tight">
                Building Services
              </h2>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-primary/15 border border-primary/30 text-[9px] font-bold uppercase tracking-wider text-primary">
                New
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-2">
              Tech help, home-cooked food, tutoring, repair — from your neighbors.
              Direct WhatsApp, no brokers.
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>
      </Link>

      <Suspense fallback={<KpiRowSkeleton count={2} />}>
        <BillAndNotices profileId={profile.id} buildingId={profile.building_id} />
      </Suspense>

      <Suspense fallback={null}>
        <ProjectsTile profileId={profile.id} buildingId={profile.building_id} />
      </Suspense>

      {/* Quiet footer links — render instantly, no data needed */}
      <nav className="pt-2 border-t border-border flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <Link
          href="/resident/transparency"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Where my money goes →
        </Link>
        <Link
          href="/resident/payments"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Payment history →
        </Link>
        <Link
          href="/resident/complaints"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Raise a complaint →
        </Link>
      </nav>
    </div>
  );
}

async function HeaderSubtitle({
  profileId,
  buildingId,
}: {
  profileId: string;
  buildingId: string | null;
}) {
  const supabase = await createClient();
  const [{ data: building }, { data: resident }] = await Promise.all([
    buildingId
      ? supabase.from("bms_buildings").select("name").eq("id", buildingId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("bms_residents")
      .select("bms_flats(flat_number)")
      .eq("profile_id", profileId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  type FlatStub = { flat_number: string };
  const flatRel = (resident as { bms_flats: FlatStub | FlatStub[] | null } | null)?.bms_flats;
  const flat = Array.isArray(flatRel) ? flatRel[0] : flatRel ?? null;

  if (!flat && !building) return <p className="text-sm text-muted-foreground mt-1 h-5">&nbsp;</p>;
  return (
    <p className="text-sm text-muted-foreground mt-1">
      {flat ? `Flat ${flat.flat_number}` : ""}
      {flat && building ? " · " : ""}
      {building?.name ?? ""}
    </p>
  );
}

async function DuesHero({
  profileId,
  buildingId,
}: {
  profileId: string;
  buildingId: string | null;
}) {
  if (!buildingId) return null;
  const supabase = await createClient();

  const { data: residentRows } = await supabase
    .from("bms_residents")
    .select("flat_id, is_primary, bms_flats(id, outstanding_dues)")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false });

  type FlatRow = { id: string; outstanding_dues: number | null };
  type ResidentRow = { flat_id: string; bms_flats: FlatRow | FlatRow[] | null };
  const rows = (residentRows ?? []) as unknown as ResidentRow[];
  const flats: FlatRow[] = rows
    .map((r) => (Array.isArray(r.bms_flats) ? r.bms_flats[0] : r.bms_flats))
    .filter((f): f is FlatRow => !!f);
  const primaryFlatId = flats[0]?.id ?? null;
  const flatIds = flats.map((f) => f.id);
  const totalOutstanding = flats.reduce(
    (s, f) => s + (Number(f.outstanding_dues) || 0),
    0,
  );

  // Last payment + open credits in parallel.
  const [{ data: lastPayment }, { data: credits }] = await Promise.all([
    primaryFlatId
      ? supabase
          .from("bms_payments")
          .select("amount, payment_date")
          .eq("flat_id", primaryFlatId)
          .order("payment_date", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    flatIds.length > 0
      ? supabase
          .from("bms_flat_credits")
          .select("amount")
          .in("flat_id", flatIds)
          .is("applied_invoice_id", null)
      : Promise.resolve({ data: [] }),
  ]);
  const openCredits = (credits ?? []).reduce(
    (s, c) => s + Number((c as { amount: number }).amount ?? 0),
    0,
  );

  const hasDues = totalOutstanding > 0;

  if (hasDues) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-gradient-to-br from-destructive/10 via-card to-card p-5 sm:p-6 shadow-[0_0_30px_-12px_hsl(0_70%_50%/0.35)]">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              {formatCurrency(totalOutstanding)} still due
            </div>
            <div className="mt-1.5 text-4xl sm:text-5xl font-bold tracking-tight tabular-nums text-destructive">
              {formatCurrency(totalOutstanding)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Pay anytime — partial payments welcome.
            </p>
            {lastPayment?.payment_date && (
              <p className="text-xs text-muted-foreground mt-1">
                Last paid {formatCurrency(Number(lastPayment.amount))} on{" "}
                {formatDate(lastPayment.payment_date)}
              </p>
            )}
          </div>
          <Link href="/resident/dues">
            <Button className="btn-big">
              <CreditCard className="w-4 h-4" />
              Pay Now
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[hsl(151_70%_55%/0.30)] bg-gradient-to-br from-[hsl(151_70%_55%/0.08)] via-card to-card p-5">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-[hsl(151_70%_55%)] shrink-0" />
        <div>
          <div className="text-base font-semibold text-foreground">
            All clear — thank you ✓
          </div>
          {openCredits > 0 && (
            <div className="text-xs text-[hsl(151_70%_55%)] mt-0.5 font-medium">
              {formatCurrency(openCredits)} credit — will apply next month
            </div>
          )}
          {lastPayment?.payment_date && (
            <div className="text-xs text-muted-foreground mt-0.5">
              Last paid {formatCurrency(Number(lastPayment.amount))} on{" "}
              {formatDate(lastPayment.payment_date)} ·{" "}
              {formatRelative(lastPayment.payment_date)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

async function BillAndNotices({
  profileId,
  buildingId,
}: {
  profileId: string;
  buildingId: string | null;
}) {
  if (!buildingId) return null;
  const supabase = await createClient();

  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

  // Get primary flat id first (small query), then bill + notices in parallel.
  const { data: resident } = await supabase
    .from("bms_residents")
    .select("flat_id, bms_flats(id)")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  type FlatStub = { id: string };
  const flatRel = (resident as { bms_flats: FlatStub | FlatStub[] | null } | null)?.bms_flats;
  const flat = Array.isArray(flatRel) ? flatRel[0] : flatRel ?? null;
  const primaryFlatId = flat?.id ?? null;

  const [{ data: currentInvoice }, { data: notices }] = await Promise.all([
    primaryFlatId
      ? supabase
          .from("bms_invoices")
          .select("id, billing_month, amount, status, due_date")
          .eq("flat_id", primaryFlatId)
          .eq("billing_month", monthStart)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("bms_notices")
      .select("id, title, pinned, created_at")
      .eq("building_id", buildingId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2),
  ]);

  // Sum chunk payments for the current invoice so the dues pill reflects
  // running balance, not the stale DB status enum.
  let currentInvoicePaid = 0;
  if (currentInvoice?.id) {
    const { data: pays } = await supabase
      .from("bms_payments")
      .select("amount")
      .eq("invoice_id", currentInvoice.id);
    currentInvoicePaid = (pays ?? []).reduce(
      (s, p) => s + Number((p as { amount: number }).amount ?? 0),
      0,
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="card-soft card-hover">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {new Date(monthStart).toLocaleDateString("en-PK", {
              month: "long",
              year: "numeric",
            })}{" "}
            bill
          </span>
          {currentInvoice && (
            <DuesPill
              status={currentInvoice.status}
              amount={Number(currentInvoice.amount)}
              paidTotal={currentInvoicePaid}
            />
          )}
        </div>
        {currentInvoice ? (
          <>
            <div className="text-2xl font-semibold tracking-tight tabular-nums">
              {formatCurrency(Number(currentInvoice.amount))}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Due {currentInvoice.due_date ? formatDate(currentInvoice.due_date) : "—"}
            </div>
            <Link
              href="/resident/dues"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-3"
            >
              View bill
              <ArrowRight className="w-3 h-3" />
            </Link>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Not generated yet.</div>
        )}
      </div>

      <div className="card-soft card-hover">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
            <Megaphone className="w-3.5 h-3.5" />
            Latest notice
          </span>
        </div>
        {notices && notices.length > 0 ? (
          <ul className="space-y-2">
            {notices.map((n) => (
              <li key={n.id} className="flex items-start gap-2">
                {n.pinned && (
                  <Pin className="w-3 h-3 text-primary shrink-0 mt-1" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium line-clamp-1">{n.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatRelative(n.created_at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-muted-foreground">No notices yet.</div>
        )}
        <Link
          href="/resident/notices"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-3"
        >
          All notices
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Compact home-screen tile that surfaces active project funds. Render-cheap:
 * skips entirely when the building has no active projects so layout doesn't
 * shift. Shows the resident's expected/paid totals when their flat has
 * shares, otherwise an aggregate community line.
 */
async function ProjectsTile({
  profileId,
  buildingId,
}: {
  profileId: string;
  buildingId: string | null;
}) {
  if (!buildingId) return null;
  const supabase = await createClient();

  const { data: residentRow } = await supabase
    .from("bms_residents")
    .select("flat_id")
    .eq("profile_id", profileId)
    .eq("building_id", buildingId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  const flatId = (residentRow as { flat_id: string } | null)?.flat_id ?? null;

  const { data: activeProjects } = await supabase
    .from("bms_projects")
    .select("id, name, contribution_rule, default_per_flat")
    .eq("building_id", buildingId)
    .eq("status", "active");

  const projects = (activeProjects ?? []) as Array<{
    id: string;
    name: string;
    contribution_rule: "equal" | "custom" | "voluntary";
    default_per_flat: number | null;
  }>;
  if (projects.length === 0) return null;

  const projectIds = projects.map((p) => p.id);

  // Pull THIS flat's shares + payments across active projects in parallel.
  const [{ data: shares }, { data: payments }] = await Promise.all([
    flatId
      ? supabase
          .from("bms_project_shares")
          .select("project_id, expected_amount")
          .eq("flat_id", flatId)
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] }),
    flatId
      ? supabase
          .from("bms_payments")
          .select("project_id, amount")
          .eq("flat_id", flatId)
          .eq("building_id", buildingId)
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] }),
  ]);

  let totalExpected = 0;
  let totalPaid = 0;
  for (const p of projects) {
    const share =
      ((shares ?? []) as Array<{ project_id: string; expected_amount: number }>).find(
        (s) => s.project_id === p.id,
      )?.expected_amount ?? (p.contribution_rule === "voluntary" ? 0 : p.default_per_flat ?? 0);
    totalExpected += Number(share ?? 0);
  }
  for (const p of (payments ?? []) as Array<{ amount: number }>) {
    totalPaid += Number(p.amount ?? 0);
  }
  const due = Math.max(0, totalExpected - totalPaid);

  return (
    <Link
      href="/resident/projects"
      className="group block rounded-xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card to-card p-4 sm:p-5 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex w-10 h-10 sm:w-12 sm:h-12 items-center justify-center rounded-lg bg-primary/15 border border-primary/25 text-primary shrink-0">
          <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-semibold tracking-tight">
              Active Projects ({projects.length})
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {flatId
              ? `${formatCurrency(totalPaid)} paid · ${formatCurrency(due)} due`
              : "View building fundraisers."}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  );
}

function HeroSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 animate-fade-in">
      <div className="h-3 w-20 rounded bg-secondary/50 animate-pulse" />
      <div className="mt-2 h-9 w-40 rounded bg-secondary/60 animate-pulse" />
      <div className="mt-2 h-3 w-32 rounded bg-secondary/40 animate-pulse" />
    </div>
  );
}
