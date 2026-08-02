import type { createClient } from "@/lib/supabase/server";

type DbClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Money totals for a building.
 *
 * Background: PostgREST aggregate syntax (`.select("amount.sum()")`) is
 * DISABLED on this project — it returns PGRST123 and `data: null`. Every call
 * site that used it was silently reading 0, which is why Cash available, the
 * finance summary, the monthly report and the reports summary all showed no
 * money regardless of what was in the tables.
 *
 * Primary path is the `bms_building_cash_totals` RPC (one round trip, exact).
 * If that function isn't deployed yet the helper transparently falls back to
 * paging through rows and summing in JS — correct either way, so shipping the
 * code before the migration can't break anything.
 *
 * The fallback pages deliberately: a plain select is capped at PostgREST's
 * max_rows (1000 on this project, measured), so a single unpaged query would
 * silently under-report any building past that many records.
 */

export type CashTotals = {
  /** All money in. */
  payments: number;
  /** All expenses, utility bills included. */
  expenses: number;
  /** The `is_bill = true` subset of `expenses`. */
  bills: number;
  /** Salaries — a separate table; omitting them overstates cash. */
  salaries: number;
};

export type TotalsWindow = {
  /** Inclusive lower bound, YYYY-MM-DD. Omit for unbounded. */
  from?: string | null;
  /** Inclusive upper bound, YYYY-MM-DD. Omit for unbounded. */
  to?: string | null;
};

const PAGE_SIZE = 1000;

type AmountRow = { amount: number | string | null };

/** Sum `amount` across every page until a short page signals the end. */
async function pagedSum(
  run: (
    rangeFrom: number,
    rangeTo: number,
  ) => PromiseLike<{ data: AmountRow[] | null; error: { message: string } | null }>,
): Promise<number> {
  let total = 0;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await run(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows) total += Number(r.amount ?? 0);
    if (rows.length < PAGE_SIZE) return total;
  }
}

async function fallbackTotals(
  supabase: DbClient,
  buildingId: string,
  { from = null, to = null }: TotalsWindow,
): Promise<CashTotals> {
  const bound = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(
    q: T,
    col: string,
  ): T => {
    let out = q;
    if (from) out = out.gte(col, from);
    if (to) out = out.lte(col, to);
    return out;
  };

  const [payments, expenses, bills, salaries] = await Promise.all([
    pagedSum((a, b) =>
      bound(
        supabase.from("bms_payments").select("amount").eq("building_id", buildingId),
        "payment_date",
      ).range(a, b),
    ),
    pagedSum((a, b) =>
      bound(
        supabase.from("bms_expenses").select("amount").eq("building_id", buildingId),
        "expense_date",
      ).range(a, b),
    ),
    pagedSum((a, b) =>
      bound(
        supabase
          .from("bms_expenses")
          .select("amount")
          .eq("building_id", buildingId)
          .eq("is_bill", true),
        "expense_date",
      ).range(a, b),
    ),
    pagedSum((a, b) =>
      bound(
        supabase.from("bms_salary_payments").select("amount").eq("building_id", buildingId),
        "payment_date",
      ).range(a, b),
    ),
  ]);

  return { payments, expenses, bills, salaries };
}

export async function getCashTotals(
  supabase: DbClient,
  buildingId: string,
  window: TotalsWindow = {},
): Promise<CashTotals> {
  const { from = null, to = null } = window;

  const { data, error } = await supabase.rpc("bms_building_cash_totals", {
    p_building_id: buildingId,
    p_from: from,
    p_to: to,
  });

  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          payments_total: number | string | null;
          expenses_total: number | string | null;
          bills_total: number | string | null;
          salaries_total: number | string | null;
        }
      | undefined;
    if (row) {
      return {
        payments: Number(row.payments_total ?? 0),
        expenses: Number(row.expenses_total ?? 0),
        bills: Number(row.bills_total ?? 0),
        salaries: Number(row.salaries_total ?? 0),
      };
    }
  }

  return fallbackTotals(supabase, buildingId, { from, to });
}

export type BankTotals = {
  /** null = the cash-in-hand bucket (no bank account attached). */
  bankAccountId: string | null;
  payments: number;
  expenses: number;
  salaries: number;
};

type BankRow = { bank_account_id: string | null; amount: number | string | null };

/** Page rows and fold them into a per-bank-account total. */
async function pagedBankSum(
  run: (
    rangeFrom: number,
    rangeTo: number,
  ) => PromiseLike<{ data: BankRow[] | null; error: { message: string } | null }>,
  into: Map<string | null, number>,
): Promise<void> {
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await run(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows) {
      const k = r.bank_account_id ?? null;
      into.set(k, (into.get(k) ?? 0) + Number(r.amount ?? 0));
    }
    if (rows.length < PAGE_SIZE) return;
  }
}

/**
 * Per-bank-account totals strictly BEFORE a date — Day Book opening balances.
 * Same RPC-then-paged-fallback strategy as {@link getCashTotals}.
 */
export async function getBankTotalsBefore(
  supabase: DbClient,
  buildingId: string,
  before: string,
): Promise<BankTotals[]> {
  const { data, error } = await supabase.rpc("bms_building_bank_totals_before", {
    p_building_id: buildingId,
    p_before: before,
  });

  if (!error && Array.isArray(data)) {
    return (
      data as {
        bank_account_id: string | null;
        payments_total: number | string | null;
        expenses_total: number | string | null;
        salaries_total: number | string | null;
      }[]
    ).map((r) => ({
      bankAccountId: r.bank_account_id ?? null,
      payments: Number(r.payments_total ?? 0),
      expenses: Number(r.expenses_total ?? 0),
      salaries: Number(r.salaries_total ?? 0),
    }));
  }

  const pay = new Map<string | null, number>();
  const exp = new Map<string | null, number>();
  const sal = new Map<string | null, number>();
  await Promise.all([
    pagedBankSum(
      (a, b) =>
        supabase
          .from("bms_payments")
          .select("bank_account_id, amount")
          .eq("building_id", buildingId)
          .lt("payment_date", before)
          .range(a, b),
      pay,
    ),
    pagedBankSum(
      (a, b) =>
        supabase
          .from("bms_expenses")
          .select("bank_account_id, amount")
          .eq("building_id", buildingId)
          .lt("expense_date", before)
          .range(a, b),
      exp,
    ),
    pagedBankSum(
      (a, b) =>
        supabase
          .from("bms_salary_payments")
          .select("bank_account_id, amount")
          .eq("building_id", buildingId)
          .lt("payment_date", before)
          .range(a, b),
      sal,
    ),
  ]);

  const keys = new Set<string | null>([...pay.keys(), ...exp.keys(), ...sal.keys()]);
  return Array.from(keys).map((k) => ({
    bankAccountId: k,
    payments: pay.get(k) ?? 0,
    expenses: exp.get(k) ?? 0,
    salaries: sal.get(k) ?? 0,
  }));
}

/**
 * Cash held as of a date: opening balance (once its as-of date has arrived)
 * plus everything in, minus everything out.
 */
export function cashBalanceFrom(
  totals: CashTotals,
  opening: { amount: number; date: string | null },
  asOf: string | null,
): number {
  const openingApplies =
    !opening.date || !asOf || opening.date <= asOf;
  return (
    (openingApplies ? opening.amount : 0) +
    totals.payments -
    totals.expenses -
    totals.salaries
  );
}
