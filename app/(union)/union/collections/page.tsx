import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { normalizePhone } from "@/lib/phone";
import { TableSkeleton, KpiRowSkeleton } from "@/components/layout/table-skeleton";
import { RecordPaymentButton } from "@/components/admin/payments/record-payment-button";
import { type PaymentRow } from "@/components/admin/payments/payments-list";
import {
  DuesDefaultersPanel,
  type DefaulterRow,
} from "@/components/admin/payments/dues-defaulters-panel";
import { UnionRecentPaymentsTable } from "@/components/union/collections/flat-history-modal";
import { PAYMENT_MODE } from "@/types";

export const dynamic = "force-dynamic";

/**
 * /union/collections — committee-wide collection ledger.
 *
 * Mirrors /admin/maintenance structurally so committee members already
 * familiar with the admin view feel at home. Three sections:
 *   1. Per-collector summary card — who collected how much THIS MONTH.
 *      The headline data point: it ends the "who collected what" arguments
 *      that derail committee meetings.
 *   2. Defaulters panel — reused from admin so union members can chase the
 *      same list (and tap WhatsApp reminders).
 *   3. Recent payments table — last 50 payments in the building, with the
 *      new Received-by column visible.
 *
 * Header has a Record Payment button so a committee officer can stand at
 * a door, collect cash, and log it without leaving this page.
 */
export default function UnionCollectionsPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <Suspense
        fallback={
          <HeaderShell>
            <div className="h-11 w-44 rounded-md bg-secondary/40 animate-pulse" />
          </HeaderShell>
        }
      >
        <CollectionsHeader />
      </Suspense>

      <Suspense fallback={<KpiRowSkeleton count={3} />}>
        <PerCollectorCard />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <DefaultersBlock />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <RecentPaymentsBlock />
      </Suspense>
    </div>
  );
}

function HeaderShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1>Collections</h1>
        <p className="text-muted-foreground">
          Who paid this month, who hasn&apos;t, and who collected what.
        </p>
      </div>
      <div className="shrink-0 flex flex-col sm:flex-row gap-2">{children}</div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────

async function CollectionsHeader() {
  const data = await loadHeaderData();
  if (!data) {
    return (
      <HeaderShell>
        <span className="text-sm text-muted-foreground">No building assigned.</span>
      </HeaderShell>
    );
  }
  return (
    <HeaderShell>
      <RecordPaymentButton
        flats={data.flats}
        buildingName={data.buildingName}
        buildingId={data.buildingId}
      />
    </HeaderShell>
  );
}

async function loadHeaderData() {
  const { profile } = await requireRole("union");
  if (!profile.building_id) return null;
  const supabase = await createClient();
  const [{ data: flats }, { data: building }] = await Promise.all([
    supabase
      .from("bms_flats")
      .select("id, flat_number, outstanding_dues")
      .eq("building_id", profile.building_id)
      .order("flat_number"),
    supabase
      .from("bms_buildings")
      .select("name")
      .eq("id", profile.building_id)
      .single(),
  ]);
  return {
    flats: (flats ?? []).map((f) => ({
      id: f.id,
      flat_number: f.flat_number,
      outstanding_dues: Number(f.outstanding_dues ?? 0),
    })),
    buildingName: building?.name ?? "Building",
    buildingId: profile.building_id,
  };
}

// ─── Per-collector summary card ───────────────────────────────────────────

type CollectorRow = {
  profile_id: string;
  name: string;
  position: string | null;
  total: number;
  count: number;
};

async function PerCollectorCard() {
  const { profile } = await requireRole("union");
  if (!profile.building_id) return null;
  const supabase = await createClient();

  const now = new Date();
  const ym = now.toISOString().slice(0, 7);
  const monthStart = `${ym}-01`;
  const monthEnd = nextMonthFirstDay(ym);

  // Pull every payment recorded this month with a non-null receiver. We
  // deliberately bucket on received_by_profile_id (not recorded_by) — the
  // receiver is the field-of-record, recorded_by may be the same admin
  // logging on behalf later from a desk session.
  //
  // Exclude credit_carryforward rows: those are virtual auto-allocations
  // of previously-collected money (the parent chunk already counts the
  // physical cash), so including them would double-count and inflate the
  // collector's total against real-world receipts.
  const { data: payments } = await supabase
    .from("bms_payments")
    .select("amount, received_by_profile_id, received_by_name, received_by_position")
    .eq("building_id", profile.building_id)
    .neq("payment_mode", PAYMENT_MODE.CREDIT_CARRYFORWARD)
    .not("received_by_profile_id", "is", null)
    .gte("payment_date", monthStart)
    .lt("payment_date", monthEnd);

  const byCollector = new Map<string, CollectorRow>();
  for (const p of payments ?? []) {
    const pid = (p as { received_by_profile_id: string | null }).received_by_profile_id;
    if (!pid) continue;
    const existing = byCollector.get(pid);
    if (existing) {
      existing.total += Number(p.amount ?? 0);
      existing.count += 1;
    } else {
      byCollector.set(pid, {
        profile_id: pid,
        name: p.received_by_name ?? "Unknown",
        position: p.received_by_position ?? null,
        total: Number(p.amount ?? 0),
        count: 1,
      });
    }
  }

  const collectors = Array.from(byCollector.values()).sort((a, b) => b.total - a.total);
  const monthLabel = now.toLocaleDateString("en-PK", { month: "short", year: "numeric" });
  const grandTotal = collectors.reduce((s, c) => s + c.total, 0);
  const grandCount = collectors.reduce((s, c) => s + c.count, 0);

  return (
    <section className="card-soft">
      <header className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold">This month&apos;s collections by member</h2>
        <span className="text-sm text-muted-foreground">({monthLabel})</span>
      </header>

      {collectors.length === 0 ? (
        <p className="text-muted-foreground">No collections recorded this month yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="px-2 py-2 font-medium">Member</th>
                <th className="px-2 py-2 font-medium text-right">Amount</th>
                <th className="px-2 py-2 font-medium text-right">Payments</th>
              </tr>
            </thead>
            <tbody>
              {collectors.map((c) => (
                <tr key={c.profile_id} className="border-b border-border last:border-0">
                  <td className="px-2 py-3">
                    <span className="font-medium">{c.name}</span>
                    {c.position && (
                      <span className="text-muted-foreground"> ({c.position})</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums font-semibold">
                    {formatCurrency(c.total)}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {c.count} {c.count === 1 ? "payment" : "payments"}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border">
                <td className="px-2 py-3 font-semibold">Total collected</td>
                <td className="px-2 py-3 text-right tabular-nums font-bold">
                  {formatCurrency(grandTotal)}
                </td>
                <td className="px-2 py-3 text-right tabular-nums font-semibold">
                  {grandCount} {grandCount === 1 ? "payment" : "payments"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function nextMonthFirstDay(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return `${nextY.toString().padStart(4, "0")}-${nextM
    .toString()
    .padStart(2, "0")}-01`;
}

// ─── Defaulters block (reuse admin component) ─────────────────────────────

const IN_CHUNK_SIZE = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length <= size) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sumPaymentsByInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  invoiceIds: string[],
): Promise<Map<string, number>> {
  const paidByInv = new Map<string, number>();
  if (invoiceIds.length === 0) return paidByInv;
  for (const ids of chunk(invoiceIds, IN_CHUNK_SIZE)) {
    const { data: pays } = await supabase
      .from("bms_payments")
      .select("invoice_id, amount")
      .eq("building_id", buildingId)
      .in("invoice_id", ids);
    for (const p of pays ?? []) {
      if (!p.invoice_id) continue;
      paidByInv.set(
        p.invoice_id,
        (paidByInv.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0),
      );
    }
  }
  return paidByInv;
}

async function DefaultersBlock() {
  const data = await loadDefaultersData();
  if (data.noBuilding) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  return (
    <DuesDefaultersPanel
      defaulters={data.rows}
      buildingName={data.buildingName}
    />
  );
}

async function loadDefaultersData() {
  const { profile } = await requireRole("union");
  if (!profile.building_id) return { noBuilding: true as const };
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("bms_invoices")
    .select("id, invoice_number, flat_id, billing_month, amount, due_date, status")
    .eq("building_id", profile.building_id)
    .neq("status", "paid")
    .neq("status", "waived")
    .order("billing_month", { ascending: true });

  const invRows = invoices ?? [];
  if (invRows.length === 0) {
    return { noBuilding: false as const, rows: [] as DefaulterRow[], buildingName: "" };
  }

  const invIds = invRows.map((i) => i.id);
  const flatIds = Array.from(new Set(invRows.map((i) => i.flat_id)));

  const [paidByInvoice, { data: flats }, { data: primaries }, { data: building }] =
    await Promise.all([
      sumPaymentsByInvoice(supabase, profile.building_id, invIds),
      supabase
        .from("bms_flats")
        .select("id, flat_number")
        .eq("building_id", profile.building_id)
        .in("id", flatIds),
      supabase
        .from("bms_residents")
        .select("id, flat_id, full_name, phone")
        .eq("building_id", profile.building_id)
        .eq("is_active", true)
        .eq("is_primary", true)
        .in("flat_id", flatIds),
      supabase
        .from("bms_buildings")
        .select("name")
        .eq("id", profile.building_id)
        .single(),
    ]);

  const flatMap = new Map((flats ?? []).map((f) => [f.id, f.flat_number]));
  const primaryByFlat = new Map(
    (primaries ?? []).map((r) => [r.flat_id, { id: r.id, name: r.full_name, phone: r.phone }]),
  );

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const rows: DefaulterRow[] = invRows
    .map((inv) => {
      const total = Number(inv.amount);
      const paid = paidByInvoice.get(inv.id) ?? 0;
      const due = total - paid;
      const primary = primaryByFlat.get(inv.flat_id);
      const daysLate =
        inv.due_date && inv.due_date < todayStr
          ? Math.floor(
              (new Date(todayStr).getTime() - new Date(inv.due_date).getTime()) /
                86_400_000,
            )
          : 0;
      return {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        flat_id: inv.flat_id,
        flat_number: flatMap.get(inv.flat_id) ?? "—",
        resident_id: primary?.id ?? null,
        resident_name: primary?.name ?? null,
        resident_phone: normalizePhone(primary?.phone ?? null),
        billing_month: inv.billing_month,
        due_date: inv.due_date,
        amount_total: total,
        amount_paid: paid,
        amount_due: due,
        days_late: daysLate,
      };
    })
    .filter((r) => r.amount_due > 0)
    .sort((a, b) => {
      if (b.days_late !== a.days_late) return b.days_late - a.days_late;
      return b.amount_due - a.amount_due;
    });

  return {
    noBuilding: false as const,
    rows,
    buildingName: building?.name ?? "Building",
  };
}

// ─── Recent payments table ────────────────────────────────────────────────

async function RecentPaymentsBlock() {
  const data = await loadRecentPaymentsData();
  if (data.noBuilding) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-lg font-semibold">Recent payments</h2>
        <p className="text-sm text-muted-foreground">
          Last {data.rows.length} payments across the building. Tap a flat
          number to see its full history.
        </p>
      </header>
      <UnionRecentPaymentsTable
        payments={data.rows}
        buildingName={data.buildingName}
        buildingId={data.buildingId}
      />
      <p className="text-sm text-muted-foreground">
        Need to generate invoices or waive bills? That stays with the admin —
        ask your President.
      </p>
    </section>
  );
}

async function loadRecentPaymentsData() {
  const { profile } = await requireRole("union");
  if (!profile.building_id) return { noBuilding: true as const };
  const supabase = await createClient();

  const [{ data: payments }, { data: flats }, { data: building }] = await Promise.all([
    supabase
      .from("bms_payments")
      .select(
        "id, payment_date, flat_id, resident_id, amount, payment_mode, category, receipt_no, legacy_receipt_no, recorded_by, invoice_id, reference_no, received_by_name, received_by_position",
      )
      .eq("building_id", profile.building_id)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("bms_flats")
      .select("id, flat_number")
      .eq("building_id", profile.building_id)
      .order("flat_number"),
    supabase
      .from("bms_buildings")
      .select("name")
      .eq("id", profile.building_id)
      .single(),
  ]);

  const residentIds = Array.from(
    new Set((payments ?? []).map((p) => p.resident_id).filter(Boolean) as string[]),
  );
  const invoiceIds = Array.from(
    new Set((payments ?? []).map((p) => p.invoice_id).filter(Boolean) as string[]),
  );
  const recorderIds = Array.from(
    new Set((payments ?? []).map((p) => p.recorded_by).filter(Boolean) as string[]),
  );

  const [{ data: residents }, { data: invoices }, { data: recorders }] = await Promise.all([
    residentIds.length
      ? supabase.from("bms_residents").select("id, full_name").in("id", residentIds)
      : Promise.resolve({ data: [] }),
    invoiceIds.length
      ? supabase
          .from("bms_invoices")
          .select("id, invoice_number, billing_month")
          .in("id", invoiceIds)
      : Promise.resolve({ data: [] }),
    recorderIds.length
      ? supabase.from("bms_profiles").select("id, full_name, email").in("id", recorderIds)
      : Promise.resolve({ data: [] }),
  ]);

  const flatMap = new Map((flats ?? []).map((f) => [f.id, f.flat_number]));
  const resMap = new Map((residents ?? []).map((r) => [r.id, r.full_name]));
  const invMap = new Map(
    (invoices ?? []).map((i) => [i.id, { number: i.invoice_number, month: i.billing_month }]),
  );
  const recMap = new Map(
    (recorders ?? []).map((p) => [p.id, p.full_name ?? p.email ?? ""]),
  );

  const rows: PaymentRow[] = (payments ?? []).map((p) => ({
    id: p.id,
    payment_date: p.payment_date,
    flat_id: p.flat_id ?? "",
    flat_number: p.flat_id ? flatMap.get(p.flat_id) ?? "—" : "—",
    resident_name: p.resident_id ? resMap.get(p.resident_id) ?? null : null,
    amount: Number(p.amount),
    payment_mode: p.payment_mode,
    category: p.category,
    receipt_no: p.receipt_no,
    legacy_receipt_no: (p as { legacy_receipt_no?: string | null }).legacy_receipt_no ?? null,
    recorded_by_name: p.recorded_by ? recMap.get(p.recorded_by) ?? null : null,
    reference_no: p.reference_no,
    invoice_id: p.invoice_id ?? null,
    invoice_number: p.invoice_id ? invMap.get(p.invoice_id)?.number ?? null : null,
    billing_month: p.invoice_id ? invMap.get(p.invoice_id)?.month ?? null : null,
    received_by_name: p.received_by_name ?? null,
    received_by_position: p.received_by_position ?? null,
  }));

  return {
    noBuilding: false as const,
    rows,
    buildingName: building?.name ?? "Building",
    buildingId: profile.building_id,
  };
}

