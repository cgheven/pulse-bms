import { Suspense } from "react";
import { requireRole, getCurrentBuildingName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rangeFromSearchParams } from "@/lib/reports/date-range";
import { ReportTabs } from "@/components/admin/reports/report-tabs";
import { ReportSkeleton } from "@/components/admin/reports/report-skeleton";
import { OverallCollectionClient } from "./overall-collection-client";
import { formatReceiptNo } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string }>;

// OUTER server component — sync, paints heading + tabs INSTANTLY on tab
// click. Inner async component below fetches data inside Suspense.
export default function OverallCollectionPage({
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
      <ReportTabs active="overall-collection" />
      <Suspense fallback={<ReportSkeleton />}>
        <OverallCollectionData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OverallCollectionData({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { profile } = await requireRole(["admin", "super_admin", "union", "accountant"]);
  if (!profile.building_id) {
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

  // Overall = every category. Server-side date bound + composite index
  // bms_payments_building_date_idx keep the fetch bounded.
  const [{ data: payments }, { data: flats }, { data: bankAccounts }] =
    await Promise.all([
      supabase
        .from("bms_payments")
        .select(
          `id, payment_date, amount, payment_mode, category, receipt_no, flat_id,
           bank_account_id, received_by_name, received_by_position,
           notes,
           bms_flats!inner(flat_number),
           bms_residents(full_name)`,
        )
        .eq("building_id", profile.building_id)
        .gte("payment_date", dateRange.from)
        .lte("payment_date", dateRange.to)
        .order("payment_date", { ascending: false }),
      supabase
        .from("bms_flats")
        .select("id, flat_number")
        .eq("building_id", profile.building_id)
        .order("flat_number"),
      supabase
        .from("bms_bank_accounts")
        .select("id, name, type")
        .eq("building_id", profile.building_id)
        .order("type", { ascending: false })
        .order("name"),
    ]);

  type RawRow = {
    id: string;
    payment_date: string;
    amount: number | string;
    payment_mode: string;
    category: string;
    receipt_no: number | null;
    flat_id: string;
    bank_account_id: string | null;
    received_by_name: string | null;
    received_by_position: string | null;
    notes: string | null;
    bms_flats: { flat_number: string } | { flat_number: string }[] | null;
    bms_residents:
      | { full_name: string }
      | { full_name: string }[]
      | null;
  };

  const rows = (payments ?? []).map((p) => {
    const r = p as unknown as RawRow;
    const flat = Array.isArray(r.bms_flats) ? r.bms_flats[0] : r.bms_flats;
    const resident = Array.isArray(r.bms_residents)
      ? r.bms_residents[0]
      : r.bms_residents;
    return {
      id: r.id,
      payment_date: r.payment_date,
      amount: Number(r.amount ?? 0),
      payment_mode: r.payment_mode,
      // Notes can contain "Transfer fee" hints; we infer the
      // transfer_fee category from notes since the DB enum doesn't
      // model it separately yet. Default falls back to the row's
      // category for the report column.
      category: /transfer/i.test(r.notes ?? "")
        ? "transfer_fee"
        : r.category,
      receipt_no: formatReceiptNo(r.receipt_no),
      flat_id: r.flat_id,
      flat_number: flat?.flat_number ?? "—",
      resident_name: resident?.full_name ?? "—",
      bank_account_id: r.bank_account_id,
      received_by:
        r.received_by_position && r.received_by_name
          ? `${r.received_by_name} (${r.received_by_position})`
          : r.received_by_name ?? "—",
    };
  });

  return (
    <OverallCollectionClient
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
      receivers={[
        ...new Set(rows.map((r) => r.received_by).filter((v) => v !== "—")),
      ]}
    />
  );
}
