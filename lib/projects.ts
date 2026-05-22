// Pulse BMS — Project Funds: shared loaders + summarisers
//
// Everything here is server-only (uses the SSR Supabase client). The
// helpers compute the same numbers that appear in the cards, the detail
// hero, the resident view, and the reports tab so a single source of
// truth governs every place "Collected / Target / Pending" surfaces.

import { createClient } from "@/lib/supabase/server";

export type ContributionRule = "equal" | "custom" | "voluntary";
export type ProjectStatus = "active" | "closed" | "cancelled";

export type ProjectRow = {
  id: string;
  building_id: string;
  name: string;
  description: string | null;
  target_amount: number | null;
  contribution_rule: ContributionRule;
  default_per_flat: number | null;
  start_date: string;
  end_date: string | null;
  status: ProjectStatus;
  proposal_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSummary = ProjectRow & {
  collected: number;
  contributors: number;
  // For voluntary projects: count of contribution rows.
  total_flats: number;
  paid_in_full: number;
  pending: number;
  days_remaining: number | null;
  // 0..1; null when target is unset (voluntary)
  progress: number | null;
};

export type FlatStanding = {
  flat_id: string;
  flat_number: string;
  resident_name: string | null;
  resident_phone: string | null;
  expected: number;
  paid: number;
  // Computed status — UI uses bms status pills for paid/partial/pending.
  status: "paid" | "partial" | "pending";
};

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Load every project for a building, plus per-project aggregates needed by
 * the index card grid. One round-trip per table — keeps the page snappy
 * even when the building has years of project history.
 */
export async function loadBuildingProjects(
  buildingId: string,
): Promise<ProjectSummary[]> {
  const supabase = await createClient();
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const [{ data: projects }, flatsCountRes] = await Promise.all([
    supabase
      .from("bms_projects")
      .select("*")
      .eq("building_id", buildingId)
      .order("status", { ascending: true }) // active before closed/cancelled
      .order("created_at", { ascending: false }),
    supabase
      .from("bms_flats")
      .select("id", { count: "exact", head: true })
      .eq("building_id", buildingId),
  ]);

  const rows = (projects ?? []) as ProjectRow[];
  if (rows.length === 0) return [];

  const totalFlatsInBuilding = flatsCountRes.count ?? 0;
  const projectIds = rows.map((r) => r.id);

  const [{ data: shares }, { data: payments }] = await Promise.all([
    supabase
      .from("bms_project_shares")
      .select("project_id, flat_id, expected_amount")
      .in("project_id", projectIds),
    supabase
      .from("bms_payments")
      .select("project_id, flat_id, amount")
      .eq("building_id", buildingId)
      .in("project_id", projectIds),
  ]);

  // Aggregate per-project
  const sharesByProject = new Map<
    string,
    Map<string, number>
  >();
  for (const s of shares ?? []) {
    const m = sharesByProject.get(s.project_id) ?? new Map<string, number>();
    m.set(s.flat_id, Number(s.expected_amount ?? 0));
    sharesByProject.set(s.project_id, m);
  }

  const paymentsByProject = new Map<
    string,
    { collected: number; paidByFlat: Map<string, number>; rows: number }
  >();
  for (const p of payments ?? []) {
    if (!p.project_id) continue;
    const bucket = paymentsByProject.get(p.project_id) ?? {
      collected: 0,
      paidByFlat: new Map<string, number>(),
      rows: 0,
    };
    bucket.collected += Number(p.amount ?? 0);
    bucket.rows += 1;
    if (p.flat_id) {
      bucket.paidByFlat.set(
        p.flat_id,
        (bucket.paidByFlat.get(p.flat_id) ?? 0) + Number(p.amount ?? 0),
      );
    }
    paymentsByProject.set(p.project_id, bucket);
  }

  return rows.map((r) => {
    const shareMap = sharesByProject.get(r.id) ?? new Map();
    const payBucket = paymentsByProject.get(r.id) ?? {
      collected: 0,
      paidByFlat: new Map<string, number>(),
      rows: 0,
    };

    let paidInFull = 0;
    let pending = 0;
    for (const [flatId, expected] of shareMap.entries()) {
      const paid = payBucket.paidByFlat.get(flatId) ?? 0;
      if (paid >= expected && expected > 0) paidInFull += 1;
      else if (paid < expected) pending += 1;
    }

    const contributors =
      r.contribution_rule === "voluntary"
        ? payBucket.paidByFlat.size
        : payBucket.paidByFlat.size;

    const totalFlats =
      r.contribution_rule === "voluntary"
        ? totalFlatsInBuilding
        : shareMap.size > 0
        ? shareMap.size
        : totalFlatsInBuilding;

    const target = r.target_amount != null ? Number(r.target_amount) : null;
    const progress =
      target && target > 0 ? Math.min(1, payBucket.collected / target) : null;
    const daysRemaining = r.end_date
      ? daysBetween(today, new Date(r.end_date))
      : null;

    return {
      ...r,
      target_amount: r.target_amount != null ? Number(r.target_amount) : null,
      default_per_flat:
        r.default_per_flat != null ? Number(r.default_per_flat) : null,
      collected: payBucket.collected,
      contributors,
      total_flats: totalFlats,
      paid_in_full: paidInFull,
      pending,
      days_remaining: daysRemaining,
      progress,
      // future-proof: surface today's date for any "started X days ago" UI
      _today: todayIso,
    } as ProjectSummary;
  });
}

/**
 * Per-flat contributor list for a single project. Voluntary projects use
 * an "expected = 0, status = paid" convention since the concept of debt
 * doesn't apply.
 */
export async function loadProjectStandings(
  project: ProjectRow,
): Promise<FlatStanding[]> {
  const supabase = await createClient();

  if (project.contribution_rule === "voluntary") {
    // Voluntary: walk payments to find contributor flats.
    const [{ data: pays }, { data: flats }, { data: residents }] = await Promise.all([
      supabase
        .from("bms_payments")
        .select("flat_id, amount")
        .eq("project_id", project.id)
        .eq("building_id", project.building_id),
      supabase
        .from("bms_flats")
        .select("id, flat_number")
        .eq("building_id", project.building_id),
      supabase
        .from("bms_residents")
        .select("flat_id, full_name, phone")
        .eq("building_id", project.building_id)
        .eq("is_active", true)
        .eq("is_primary", true),
    ]);

    const flatMap = new Map((flats ?? []).map((f) => [f.id, f.flat_number]));
    const resMap = new Map(
      (residents ?? []).map((r) => [r.flat_id, { name: r.full_name, phone: r.phone }]),
    );
    const paidByFlat = new Map<string, number>();
    for (const p of pays ?? []) {
      if (!p.flat_id) continue;
      paidByFlat.set(p.flat_id, (paidByFlat.get(p.flat_id) ?? 0) + Number(p.amount ?? 0));
    }

    return Array.from(paidByFlat.entries())
      .map(([flatId, paid]) => ({
        flat_id: flatId,
        flat_number: flatMap.get(flatId) ?? "—",
        resident_name: resMap.get(flatId)?.name ?? null,
        resident_phone: resMap.get(flatId)?.phone ?? null,
        expected: 0,
        paid,
        status: "paid" as const,
      }))
      .sort((a, b) => b.paid - a.paid);
  }

  // equal / custom: every flat with a share row appears.
  const [{ data: shares }, { data: pays }, { data: flats }, { data: residents }] =
    await Promise.all([
      supabase
        .from("bms_project_shares")
        .select("flat_id, expected_amount")
        .eq("project_id", project.id),
      supabase
        .from("bms_payments")
        .select("flat_id, amount")
        .eq("project_id", project.id)
        .eq("building_id", project.building_id),
      supabase
        .from("bms_flats")
        .select("id, flat_number")
        .eq("building_id", project.building_id),
      supabase
        .from("bms_residents")
        .select("flat_id, full_name, phone")
        .eq("building_id", project.building_id)
        .eq("is_active", true)
        .eq("is_primary", true),
    ]);

  const flatMap = new Map((flats ?? []).map((f) => [f.id, f.flat_number]));
  const resMap = new Map(
    (residents ?? []).map((r) => [r.flat_id, { name: r.full_name, phone: r.phone }]),
  );
  const paidByFlat = new Map<string, number>();
  for (const p of pays ?? []) {
    if (!p.flat_id) continue;
    paidByFlat.set(p.flat_id, (paidByFlat.get(p.flat_id) ?? 0) + Number(p.amount ?? 0));
  }

  const rows: FlatStanding[] = (shares ?? []).map((s) => {
    const expected = Number(s.expected_amount ?? 0);
    const paid = paidByFlat.get(s.flat_id) ?? 0;
    let status: FlatStanding["status"] = "pending";
    if (expected > 0 && paid >= expected) status = "paid";
    else if (paid > 0 && paid < expected) status = "partial";
    return {
      flat_id: s.flat_id,
      flat_number: flatMap.get(s.flat_id) ?? "—",
      resident_name: resMap.get(s.flat_id)?.name ?? null,
      resident_phone: resMap.get(s.flat_id)?.phone ?? null,
      expected,
      paid,
      status,
    };
  });

  // sort: pending first (by amount owed), then partial, then paid
  rows.sort((a, b) => {
    const order = { pending: 0, partial: 1, paid: 2 } as const;
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    const aDue = Math.max(0, a.expected - a.paid);
    const bDue = Math.max(0, b.expected - b.paid);
    if (aDue !== bDue) return bDue - aDue;
    return a.flat_number.localeCompare(b.flat_number, "en", { numeric: true });
  });

  return rows;
}

/**
 * Recent contribution payments for a single project. Capped at 100 to
 * keep the timeline tab snappy.
 */
export type ContributionRow = {
  id: string;
  payment_date: string;
  amount: number;
  payment_mode: string;
  receipt_no: string | null;
  flat_id: string;
  flat_number: string;
  resident_name: string | null;
  received_by: string | null;
  notes: string | null;
};

export async function loadProjectContributions(
  project: ProjectRow,
  limit = 100,
): Promise<ContributionRow[]> {
  const supabase = await createClient();
  const { data: pays } = await supabase
    .from("bms_payments")
    .select(
      "id, payment_date, amount, payment_mode, receipt_no, flat_id, resident_id, received_by_name, received_by_position, notes",
    )
    .eq("project_id", project.id)
    .eq("building_id", project.building_id)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  const flatIds = Array.from(
    new Set((pays ?? []).map((p) => p.flat_id).filter(Boolean) as string[]),
  );
  const residentIds = Array.from(
    new Set((pays ?? []).map((p) => p.resident_id).filter(Boolean) as string[]),
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
  const flatMap = new Map((flats ?? []).map((f) => [f.id, f.flat_number]));
  const resMap = new Map((residents ?? []).map((r) => [r.id, r.full_name]));

  return (pays ?? []).map((p) => ({
    id: p.id,
    payment_date: p.payment_date,
    amount: Number(p.amount ?? 0),
    payment_mode: p.payment_mode,
    receipt_no: p.receipt_no ?? null,
    flat_id: p.flat_id ?? "",
    flat_number: p.flat_id ? flatMap.get(p.flat_id) ?? "—" : "—",
    resident_name: p.resident_id ? resMap.get(p.resident_id) ?? null : null,
    received_by:
      p.received_by_name && p.received_by_position
        ? `${p.received_by_name} (${p.received_by_position})`
        : p.received_by_name ?? null,
    notes: p.notes ?? null,
  }));
}
