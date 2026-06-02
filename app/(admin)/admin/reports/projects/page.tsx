import { Suspense } from "react";
import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { rangeFromSearchParams } from "@/lib/reports/date-range";
import { ReportTabs } from "@/components/admin/reports/report-tabs";
import { ReportSkeleton } from "@/components/admin/reports/report-skeleton";
import { ProjectsReportClient } from "./projects-report-client";
import { formatReceiptNo } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string; project?: string }>;

// OUTER server component — paints the page chrome (Reports heading + tabs)
// synchronously so tab switches feel instant. Inner async component below
// streams in data inside Suspense.
export default function ProjectsReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="space-y-1">
        <h1>Reports</h1>
        <p className="text-muted-foreground text-sm">
          Accountant-grade reports — live preview, column picker, CSV and PDF.
        </p>
      </div>
      <ReportTabs active="projects" />
      <Suspense fallback={<ReportSkeleton />}>
        <ProjectsData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ProjectsData({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireRole(["admin", "super_admin", "union"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const sp = await searchParams;
  const dateRange = rangeFromSearchParams(sp);
  const projectFilter = sp.project && sp.project !== "all" ? sp.project : null;

  const supabase = await createClient();
  const buildingName = (await getCurrentBuildingName()) ?? "Building";

  // One query for project rows (used by filter dropdown + display name lookup),
  // one for payments filtered to category=project in the period. We join in
  // memory because PostgREST nested selects break aggregate filters.
  const [{ data: projectsRaw }, { data: paymentsRaw }, { data: bankAccountsRaw }] =
    await Promise.all([
      supabase
        .from("bms_projects")
        .select("id, name, status")
        .eq("building_id", buildingId)
        .order("status", { ascending: true })
        .order("created_at", { ascending: false }),
      // Server-side date filter keeps the wire payload small.
      (() => {
        let q = supabase
          .from("bms_payments")
          .select(
            "id, payment_date, amount, payment_mode, receipt_no, flat_id, resident_id, received_by_name, received_by_position, bank_account_id, project_id",
          )
          .eq("building_id", buildingId)
          .eq("category", "project")
          .gte("payment_date", dateRange.from)
          .lte("payment_date", dateRange.to)
          .not("project_id", "is", null)
          .order("payment_date", { ascending: false });
        if (projectFilter) q = q.eq("project_id", projectFilter);
        return q;
      })(),
      supabase
        .from("bms_bank_accounts")
        .select("id, name, type")
        .eq("building_id", buildingId)
        .order("type", { ascending: false })
        .order("name"),
    ]);

  const payments = paymentsRaw ?? [];

  // Look up flat numbers + resident names in batch
  const flatIds = Array.from(
    new Set(
      payments
        .map((p) => (p as { flat_id: string | null }).flat_id)
        .filter((id): id is string => !!id),
    ),
  );
  const residentIds = Array.from(
    new Set(
      payments
        .map((p) => (p as { resident_id: string | null }).resident_id)
        .filter((id): id is string => !!id),
    ),
  );

  const [{ data: flats }, { data: residents }] = await Promise.all([
    flatIds.length
      ? supabase
          .from("bms_flats")
          .select("id, flat_number")
          .in("id", flatIds)
      : Promise.resolve({ data: [] }),
    residentIds.length
      ? supabase
          .from("bms_residents")
          .select("id, full_name")
          .in("id", residentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const flatMap = new Map(
    (flats ?? []).map((f) => [
      (f as { id: string }).id,
      (f as { flat_number: string }).flat_number,
    ]),
  );
  const residentMap = new Map(
    (residents ?? []).map((r) => [
      (r as { id: string }).id,
      (r as { full_name: string }).full_name,
    ]),
  );
  const projectMap = new Map(
    (projectsRaw ?? []).map((p) => [
      (p as { id: string }).id,
      (p as { name: string }).name,
    ]),
  );
  const bankMap = new Map(
    (bankAccountsRaw ?? []).map((b) => [
      (b as { id: string }).id,
      b as { id: string; name: string; type: "cash" | "bank" },
    ]),
  );

  const rows = payments.map((p) => {
    const row = p as {
      id: string;
      payment_date: string;
      amount: number;
      payment_mode: string;
      receipt_no: number | null;
      flat_id: string | null;
      resident_id: string | null;
      received_by_name: string | null;
      received_by_position: string | null;
      bank_account_id: string | null;
      project_id: string;
    };
    return {
      id: row.id,
      payment_date: row.payment_date,
      amount: Number(row.amount ?? 0),
      payment_mode: row.payment_mode,
      receipt_no: formatReceiptNo(row.receipt_no) || null,
      flat_number: row.flat_id ? flatMap.get(row.flat_id) ?? "—" : "—",
      resident_name: row.resident_id ? residentMap.get(row.resident_id) ?? null : null,
      received_by_name: row.received_by_name,
      received_by_position: row.received_by_position,
      bank_account_name: row.bank_account_id
        ? bankMap.get(row.bank_account_id)?.name ?? "—"
        : "—",
      project_id: row.project_id,
      project_name: projectMap.get(row.project_id) ?? "—",
    };
  });

  return (
    <ProjectsReportClient
      buildingName={buildingName}
      initialDateRange={dateRange}
      initialProjectFilter={projectFilter ?? "all"}
      rows={rows}
      projects={(projectsRaw ?? []).map((p) => ({
        id: (p as { id: string }).id,
        name: (p as { name: string }).name,
        status: (p as { status: "active" | "closed" | "cancelled" }).status,
      }))}
    />
  );
}
