import { Suspense } from "react";
import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { rangeFromSearchParams } from "@/lib/reports/date-range";
import { ReportTabs } from "@/components/admin/reports/report-tabs";
import { ReportSkeleton } from "@/components/admin/reports/report-skeleton";
import { MaintenanceCollectionClient } from "./maintenance-collection-client";
import { formatReceiptNo } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string }>;

// OUTER server component — sync, paints heading + tabs INSTANTLY on tab
// click. Inner async component below fetches data inside Suspense.
export default function MaintenanceCollectionPage({
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
      <ReportTabs active="maintenance-collection" />
      <Suspense fallback={<ReportSkeleton />}>
        <MaintenanceCollectionData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function MaintenanceCollectionData({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
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

  const supabase = await createClient();
  const buildingName = (await getCurrentBuildingName()) ?? "Building";

  // category='maintenance' only. Server-side date bound + composite index
  // bms_payments_building_date_idx keep the fetch under ~30 days of rows.
  const [{ data: payments }, { data: flats }, { data: bankAccounts }] =
    await Promise.all([
      supabase
        .from("bms_payments")
        .select(
          `id, payment_date, amount, payment_mode, receipt_no, flat_id,
           bank_account_id, received_by_name, received_by_position,
           bms_flats!inner(flat_number),
           bms_residents(full_name),
           bms_invoices(billing_month)`,
        )
        .eq("building_id", buildingId)
        .eq("category", "maintenance")
        .gte("payment_date", dateRange.from)
        .lte("payment_date", dateRange.to)
        .order("payment_date", { ascending: false }),
      supabase
        .from("bms_flats")
        .select("id, flat_number")
        .eq("building_id", buildingId)
        .order("flat_number"),
      supabase
        .from("bms_bank_accounts")
        .select("id, name, type")
        .eq("building_id", buildingId)
        .order("type", { ascending: false })
        .order("name"),
    ]);

  type RawRow = {
    id: string;
    payment_date: string;
    amount: number | string;
    payment_mode: string;
    receipt_no: number | null;
    flat_id: string;
    bank_account_id: string | null;
    received_by_name: string | null;
    received_by_position: string | null;
    bms_flats: { flat_number: string } | { flat_number: string }[] | null;
    bms_residents:
      | { full_name: string }
      | { full_name: string }[]
      | null;
    bms_invoices:
      | { billing_month: string | null }
      | { billing_month: string | null }[]
      | null;
  };

  const rows = (payments ?? []).map((p) => {
    const r = p as unknown as RawRow;
    const flat = Array.isArray(r.bms_flats) ? r.bms_flats[0] : r.bms_flats;
    const resident = Array.isArray(r.bms_residents)
      ? r.bms_residents[0]
      : r.bms_residents;
    const invoice = Array.isArray(r.bms_invoices)
      ? r.bms_invoices[0]
      : r.bms_invoices;
    return {
      id: r.id,
      payment_date: r.payment_date,
      amount: Number(r.amount ?? 0),
      payment_mode: r.payment_mode,
      receipt_no: formatReceiptNo(r.receipt_no),
      flat_id: r.flat_id,
      flat_number: flat?.flat_number ?? "—",
      resident_name: resident?.full_name ?? "—",
      invoice_month: invoice?.billing_month ?? null,
      bank_account_id: r.bank_account_id,
      received_by:
        r.received_by_position && r.received_by_name
          ? `${r.received_by_name} (${r.received_by_position})`
          : r.received_by_name ?? "—",
    };
  });

  return (
    <MaintenanceCollectionClient
      buildingName={buildingName}
      initialDateRange={dateRange}
      rows={rows}
      flats={(flats ?? []).map((f) => ({
        id: f.id,
        flat_number: f.flat_number,
      }))}
      bankAccounts={(bankAccounts ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        type: b.type as "cash" | "bank",
      }))}
      // Unique receiver list comes from the payment rows themselves so the
      // dropdown reflects who actually collected, not a fixed list of
      // committee members.
      receivers={[
        ...new Set(rows.map((r) => r.received_by).filter((v) => v !== "—")),
      ]}
    />
  );
}
