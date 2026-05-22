import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import { BillAccountDetailClient } from "./bill-account-detail-client";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

// OUTER server component — paints page chrome instantly. The data
// fetch + heavy aggregation happens inside Suspense so a slow query
// never blocks the navigation. Mirrors the projects detail pattern.
export default function BillAccountDetailPage({ params }: { params: Params }) {
  return (
    <div className="space-y-5 animate-fade-up">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Inner params={params} />
      </Suspense>
    </div>
  );
}

async function Inner({ params }: { params: Params }) {
  const { id } = await params;
  // Treasury concern — union members browse the parent list but can't
  // see the per-account history. Mirrors the bill-accounts page.
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const supabase = await createClient();

  // Verify the account belongs to the caller's building. RLS already
  // blocks cross-tenant reads, but `notFound()` gives a cleaner 404
  // than an empty page and is consistent with other detail routes.
  const { data: account } = await supabase
    .from("bms_bill_accounts")
    .select(
      "id, provider, provider_label, nickname, account_number, location, notes, is_active, created_at",
    )
    .eq("id", id)
    .eq("building_id", profile.building_id)
    .maybeSingle();
  if (!account) notFound();

  // Last 24 months of bills against this account. Younger accounts
  // simply return fewer rows. Keeps payload bounded for very long-lived
  // societies (5+ years × monthly bills would otherwise hit ~60 rows).
  const since = new Date();
  since.setMonth(since.getMonth() - 24);
  const sinceIso = since.toISOString().slice(0, 10);

  const [{ data: bills }, { data: bankAccounts }] = await Promise.all([
    supabase
      .from("bms_expenses")
      .select(
        "id, expense_date, amount, units_consumed, vendor, description, subcategory, bank_account_id, recurrence, due_date",
      )
      .eq("building_id", profile.building_id)
      .eq("bill_account_id", id)
      .gte("expense_date", sinceIso)
      .order("expense_date", { ascending: false }),
    supabase
      .from("bms_bank_accounts")
      .select("id, name, type")
      .eq("building_id", profile.building_id),
  ]);

  return (
    <BillAccountDetailClient
      account={{
        id: account.id,
        provider: account.provider,
        provider_label: account.provider_label,
        nickname: account.nickname,
        account_number: account.account_number,
        location: account.location,
        notes: account.notes,
        is_active: !!account.is_active,
        created_at: account.created_at,
      }}
      bills={(bills ?? []).map((b) => ({
        id: b.id,
        expense_date: b.expense_date,
        amount: Number(b.amount ?? 0),
        units_consumed:
          b.units_consumed != null ? Number(b.units_consumed) : null,
        vendor: b.vendor ?? "",
        description: b.description ?? "",
        subcategory: b.subcategory ?? "",
        bank_account_id: b.bank_account_id ?? null,
        due_date: b.due_date ?? null,
        recurrence: (b.recurrence ?? null) as
          | "monthly"
          | "quarterly"
          | "yearly"
          | null,
      }))}
      bankAccounts={(bankAccounts ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        type: b.type as "cash" | "bank",
      }))}
    />
  );
}
