import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import { BillAccountsClient } from "./bill-accounts-client";

export const dynamic = "force-dynamic";

// OUTER server component — sync, paints heading instantly. Inner async
// component fetches data inside Suspense so navigating to this route
// from elsewhere doesn't block on a slow query.
export default function BillAccountsPage() {
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="space-y-1">
        <h1>Bill Accounts</h1>
        <p className="text-muted-foreground">
          Track every utility &amp; recurring contract in one place. Set up
          each connection once; monthly bills auto-link from the expense
          form.
        </p>
      </div>
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <BillAccountsData />
      </Suspense>
    </div>
  );
}

async function BillAccountsData() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }

  const supabase = await createClient();

  // All accounts (active + inactive) so the "Active only" toggle works
  // client-side without a round-trip. Reasonably bounded — even large
  // societies max out around ~15 accounts.
  const [{ data: accounts }, { data: building }] = await Promise.all([
    supabase
      .from("bms_bill_accounts")
      .select(
        "id, provider, provider_label, nickname, account_number, location, notes, is_active, created_at",
      )
      .eq("building_id", profile.building_id)
      .order("is_active", { ascending: false })
      .order("nickname"),
    supabase
      .from("bms_buildings")
      .select("city")
      .eq("id", profile.building_id)
      .single(),
  ]);

  // Last expense per account — fetched in one query, mapped client-side
  // to avoid an N+1. Bounded to the last 6 months so very long-lived
  // societies (5+ years × ~15 accounts × monthly bills) don't drag the
  // dashboard. "No recent bills" is rendered when an account has nothing
  // in that window.
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const accountIds = (accounts ?? []).map((a) => a.id);
  const { data: lastBills } = accountIds.length
    ? await supabase
        .from("bms_expenses")
        .select("bill_account_id, expense_date, amount")
        .eq("building_id", profile.building_id)
        .in("bill_account_id", accountIds)
        .gte("expense_date", sixMonthsAgo)
        .order("expense_date", { ascending: false })
    : { data: [] as Array<{ bill_account_id: string | null; expense_date: string; amount: number }> };

  // Map account_id → most recent bill (already sorted desc, so first hit wins).
  const lastByAccount = new Map<
    string,
    { expense_date: string; amount: number }
  >();
  for (const b of lastBills ?? []) {
    if (!b.bill_account_id) continue;
    if (!lastByAccount.has(b.bill_account_id)) {
      lastByAccount.set(b.bill_account_id, {
        expense_date: b.expense_date,
        amount: Number(b.amount ?? 0),
      });
    }
  }

  return (
    <BillAccountsClient
      city={building?.city ?? null}
      accounts={(accounts ?? []).map((a) => {
        const last = lastByAccount.get(a.id);
        return {
          id: a.id,
          provider: a.provider,
          provider_label: a.provider_label,
          nickname: a.nickname,
          account_number: a.account_number,
          location: a.location,
          notes: a.notes,
          is_active: !!a.is_active,
          last_bill_amount: last?.amount ?? null,
          last_bill_date: last?.expense_date ?? null,
        };
      })}
    />
  );
}
