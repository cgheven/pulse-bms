import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadBuildingProjects, type ProjectSummary } from "@/lib/projects";
import {
  ResidentProjectsClient,
  type ResidentProjectView,
} from "@/components/resident/projects/resident-projects-client";

export const dynamic = "force-dynamic";

// OUTER sync server component — paints the page chrome (heading + subtitle)
// instantly, then streams in the project list inside a Suspense boundary so
// the resident sees structure immediately on navigation.
export default async function ResidentProjectsPage() {
  const { profile } = await requireRole("resident");
  if (!profile.building_id) {
    return (
      <div className="space-y-5 animate-fade-up max-w-4xl">
        <header>
          <h1 className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Building Projects
          </h1>
        </header>
        <div className="card-soft">
          <p className="text-muted-foreground">
            No building assigned to your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up max-w-4xl">
      <header>
        <h1 className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          Building Projects
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fundraisers your building is running — see what your flat owes, what
          the community has collected, and where it stands.
        </p>
      </header>
      <Suspense fallback={<ListSkeleton />}>
        <Inner
          profileId={profile.id}
          buildingId={profile.building_id}
          residentName={profile.full_name}
        />
      </Suspense>
    </div>
  );
}

async function Inner({
  profileId,
  buildingId,
  residentName,
}: {
  profileId: string;
  buildingId: string;
  residentName: string | null;
}) {
  const supabase = await createClient();

  // Resolve THIS resident's primary flat. The transparency toggle lives on
  // bms_buildings (per Union settings) and gates per-flat name visibility
  // for non-voluntary projects.
  const [{ data: residentRow }, { data: building }, projects] =
    await Promise.all([
      supabase
        .from("bms_residents")
        .select("flat_id, bms_flats(id, flat_number)")
        .eq("profile_id", profileId)
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("bms_buildings")
        .select("name, address, city, expose_defaulter_names")
        .eq("id", buildingId)
        .maybeSingle(),
      loadBuildingProjects(buildingId),
    ]);

  type FlatStub = { id: string; flat_number: string };
  const flatRel = (residentRow as { bms_flats: FlatStub | FlatStub[] | null } | null)
    ?.bms_flats;
  const flat = Array.isArray(flatRel) ? flatRel[0] : flatRel ?? null;
  const flatId = flat?.id ?? null;
  const flatNumber = flat?.flat_number ?? "—";

  if (projects.length === 0) {
    return (
      <ResidentProjectsClient
        views={[]}
        exposeDefaulterNames={Boolean(
          (building as { expose_defaulter_names: boolean } | null)
            ?.expose_defaulter_names,
        )}
        buildingName={(building as { name: string } | null)?.name ?? "Building"}
        buildingAddress={(building as { address: string | null } | null)?.address ?? null}
        buildingCity={(building as { city: string | null } | null)?.city ?? null}
        flatNumber={flatNumber}
        residentName={residentName}
      />
    );
  }

  // Resident-personal aggregates: load shares + payments for THIS flat only,
  // across all visible projects. One round-trip each.
  const projectIds = projects.map((p) => p.id);
  const [{ data: shares }, { data: payments }] = await Promise.all([
    flatId
      ? supabase
          .from("bms_project_shares")
          .select(
            "project_id, expected_amount",
          )
          .in("project_id", projectIds)
          .eq("flat_id", flatId)
      : Promise.resolve({ data: [] }),
    flatId
      ? supabase
          .from("bms_payments")
          .select(
            "id, project_id, payment_date, amount, payment_mode, receipt_no, invoice_id, received_by_name, received_by_position",
          )
          .in("project_id", projectIds)
          .eq("flat_id", flatId)
          .eq("building_id", buildingId)
          .order("payment_date", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  // Pull invoice numbers / billing months for any payment that's tied to one
  // (shouldn't happen for project rows, but the receipt PDF supports it).
  const invoiceIds = Array.from(
    new Set(
      ((payments ?? []) as Array<{ invoice_id: string | null }>)
        .map((p) => p.invoice_id)
        .filter((id): id is string => !!id),
    ),
  );
  const { data: invoiceRows } = invoiceIds.length
    ? await supabase
        .from("bms_invoices")
        .select("id, invoice_number, billing_month")
        .in("id", invoiceIds)
    : { data: [] };
  const invMap = new Map(
    (invoiceRows ?? []).map((r) => [
      (r as { id: string }).id,
      r as { invoice_number: string; billing_month: string },
    ]),
  );

  const expectedByProject = new Map<string, number>();
  for (const s of (shares ?? []) as Array<{
    project_id: string;
    expected_amount: number;
  }>) {
    expectedByProject.set(s.project_id, Number(s.expected_amount ?? 0));
  }

  const paymentsByProject = new Map<
    string,
    Array<{
      id: string;
      receipt_no: string | null;
      payment_date: string | null;
      amount: number;
      payment_mode: string | null;
      invoice_number: string | null;
      billing_month: string | null;
      received_by_name: string | null;
      received_by_position: string | null;
    }>
  >();
  const paidByProject = new Map<string, number>();
  for (const p of (payments ?? []) as Array<{
    id: string;
    project_id: string;
    payment_date: string | null;
    amount: number;
    payment_mode: string | null;
    receipt_no: string | null;
    invoice_id: string | null;
    received_by_name: string | null;
    received_by_position: string | null;
  }>) {
    const inv = p.invoice_id ? invMap.get(p.invoice_id) : null;
    const list = paymentsByProject.get(p.project_id) ?? [];
    list.push({
      id: p.id,
      receipt_no: p.receipt_no,
      payment_date: p.payment_date,
      amount: Number(p.amount ?? 0),
      payment_mode: p.payment_mode,
      invoice_number: inv?.invoice_number ?? null,
      billing_month: inv?.billing_month ?? null,
      received_by_name: p.received_by_name,
      received_by_position: p.received_by_position,
    });
    paymentsByProject.set(p.project_id, list);
    paidByProject.set(
      p.project_id,
      (paidByProject.get(p.project_id) ?? 0) + Number(p.amount ?? 0),
    );
  }

  const views: ResidentProjectView[] = projects.map((proj: ProjectSummary) => {
    const expected =
      proj.contribution_rule === "voluntary"
        ? 0
        : expectedByProject.get(proj.id) ?? proj.default_per_flat ?? 0;
    return {
      project: proj,
      myExpected: expected,
      myPaid: paidByProject.get(proj.id) ?? 0,
      myContributions: paymentsByProject.get(proj.id) ?? [],
    };
  });

  return (
    <ResidentProjectsClient
      views={views}
      exposeDefaulterNames={Boolean(
        (building as { expose_defaulter_names: boolean } | null)
          ?.expose_defaulter_names,
      )}
      buildingName={(building as { name: string } | null)?.name ?? "Building"}
      buildingAddress={
        (building as { address: string | null } | null)?.address ?? null
      }
      buildingCity={(building as { city: string | null } | null)?.city ?? null}
      flatNumber={flatNumber}
      residentName={residentName}
    />
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border bg-card p-5 space-y-4"
        >
          <div className="h-4 w-32 rounded bg-muted/40 animate-pulse" />
          <div className="h-6 w-60 rounded bg-muted/40 animate-pulse" />
          <div className="h-3 w-full rounded-full bg-muted/40 animate-pulse" />
          <div className="h-3 w-full rounded-full bg-muted/40 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
