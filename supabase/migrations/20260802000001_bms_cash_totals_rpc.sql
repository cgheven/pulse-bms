-- Money totals as RPCs, replacing PostgREST `amount.sum()` aggregate syntax.
--
-- Why: aggregate functions are DISABLED on this project (PostgREST returns
-- PGRST123 "Use of aggregate functions is not allowed"). Every call site that
-- used `.select("amount.sum()")` was silently receiving `data: null` and
-- coercing it to 0 — so "Cash available", the finance summary, the monthly
-- report and the reports summary all showed 0 regardless of real money.
--
-- Enabling aggregates project-wide was rejected deliberately: this Postgres
-- instance is shared with the live HMS product, and `db-aggregates-enabled`
-- is a global PostgREST setting. These functions are bms_-scoped instead and
-- change nothing outside this product.
--
-- SECURITY INVOKER (not DEFINER): the functions run as the caller, so the
-- existing RLS policies on bms_payments / bms_expenses / bms_salary_payments
-- still apply. They cannot read a building the caller couldn't already read,
-- and they grant no new privileges.

-- Totals for one building over an optional [p_from, p_to] inclusive window.
-- NULL bounds mean "unbounded" — pass both NULL for lifetime totals, or just
-- p_to for a running balance as of a date.
create or replace function public.bms_building_cash_totals(
  p_building_id uuid,
  p_from date default null,
  p_to   date default null
)
returns table (
  payments_total numeric,
  expenses_total numeric,
  bills_total    numeric,
  salaries_total numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    -- All money in.
    coalesce((
      select sum(p.amount) from public.bms_payments p
       where p.building_id = p_building_id
         and (p_from is null or p.payment_date >= p_from)
         and (p_to   is null or p.payment_date <= p_to)
    ), 0)::numeric,
    -- All expenses, bills included. Callers wanting operations-only should
    -- subtract bills_total rather than re-querying.
    coalesce((
      select sum(e.amount) from public.bms_expenses e
       where e.building_id = p_building_id
         and (p_from is null or e.expense_date >= p_from)
         and (p_to   is null or e.expense_date <= p_to)
    ), 0)::numeric,
    -- Utility/recurring bills subset (is_bill = true).
    coalesce((
      select sum(e.amount) from public.bms_expenses e
       where e.building_id = p_building_id
         and coalesce(e.is_bill, false)
         and (p_from is null or e.expense_date >= p_from)
         and (p_to   is null or e.expense_date <= p_to)
    ), 0)::numeric,
    -- Salaries live in their own table; omitting them overstates cash.
    coalesce((
      select sum(s.amount) from public.bms_salary_payments s
       where s.building_id = p_building_id
         and (p_from is null or s.payment_date >= p_from)
         and (p_to   is null or s.payment_date <= p_to)
    ), 0)::numeric;
$$;

comment on function public.bms_building_cash_totals(uuid, date, date) is
  'Payment/expense/bill/salary totals for a building over an optional inclusive date window. NULL bounds are unbounded. Replaces PostgREST amount.sum(), which is disabled project-wide.';

-- Day Book needs opening balances per bank account: totals strictly BEFORE a
-- date, grouped by bank_account_id (NULL = cash in hand).
create or replace function public.bms_building_bank_totals_before(
  p_building_id uuid,
  p_before date
)
returns table (
  bank_account_id uuid,
  payments_total  numeric,
  expenses_total  numeric,
  salaries_total  numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with p as (
    select b.bank_account_id, sum(b.amount) as amt
      from public.bms_payments b
     where b.building_id = p_building_id and b.payment_date < p_before
     group by b.bank_account_id
  ), e as (
    select b.bank_account_id, sum(b.amount) as amt
      from public.bms_expenses b
     where b.building_id = p_building_id and b.expense_date < p_before
     group by b.bank_account_id
  ), s as (
    select b.bank_account_id, sum(b.amount) as amt
      from public.bms_salary_payments b
     where b.building_id = p_building_id and b.payment_date < p_before
     group by b.bank_account_id
  ), keys as (
    select p.bank_account_id from p
    union
    select e.bank_account_id from e
    union
    select s.bank_account_id from s
  )
  -- `is not distinct from` so the NULL bank_account_id bucket (cash in hand)
  -- joins correctly instead of dropping out.
  select k.bank_account_id,
         coalesce(p.amt, 0)::numeric,
         coalesce(e.amt, 0)::numeric,
         coalesce(s.amt, 0)::numeric
    from keys k
    left join p on p.bank_account_id is not distinct from k.bank_account_id
    left join e on e.bank_account_id is not distinct from k.bank_account_id
    left join s on s.bank_account_id is not distinct from k.bank_account_id;
$$;

comment on function public.bms_building_bank_totals_before(uuid, date) is
  'Per-bank-account payment/expense/salary totals strictly before a date, for Day Book opening balances. NULL bank_account_id is the cash-in-hand bucket.';

grant execute on function public.bms_building_cash_totals(uuid, date, date) to authenticated;
grant execute on function public.bms_building_bank_totals_before(uuid, date) to authenticated;
