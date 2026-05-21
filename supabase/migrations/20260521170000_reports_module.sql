-- ============================================================
-- Pulse BMS — Reports Module
--
-- Adds:
--   1. bms_bank_accounts        — multi-bank schema per building
--   2. bms_expenses.is_bill     — separates recurring utility BILLS
--                                 from operating EXPENSES
--   3. bms_payments.bank_account_id
--   4. bms_expenses.bank_account_id
--   5. bms_salary_payments.bank_account_id
--   6. Seeds one default "Cash" bank account per existing building
--
-- The reports module consumes these tables to produce accountant-grade
-- reports (Expenses, Bills, Maintenance Collection, Overall Collection,
-- Cash Position). bank_account_id is nullable so existing rows survive
-- the migration unmodified; a backfill UPDATE points every legacy row
-- at the per-building default Cash account.
--
-- RLS for bms_bank_accounts mirrors bms_flat_credits:
--   * SELECT: admin / super_admin / union for own building
--   * WRITE:  admin / super_admin within own building
--   * Demo users blocked from writes via 3 restrictive deny policies
-- ============================================================

-- ─── 1. Bank accounts table ───
create table if not exists public.bms_bank_accounts (
  id                     uuid primary key default gen_random_uuid(),
  building_id            uuid not null references public.bms_buildings(id) on delete cascade,
  name                   text not null,
  type                   text not null check (type in ('cash', 'bank')),
  account_number_masked  text,
  opening_balance        numeric(12,2) not null default 0,
  opening_balance_date   date not null,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now()
);

create index if not exists bms_bank_accounts_building_idx
  on public.bms_bank_accounts (building_id);

-- ─── 2. is_bill column on bms_expenses ───
-- Default false so all existing rows remain "operating expense". Admins
-- mark true at insert time when recording a recurring utility (K-Electric,
-- SSGC, internet, lift AMC, etc.). The Reports module's Bills report
-- filters on is_bill=true; Expenses report filters on is_bill=false.
alter table public.bms_expenses
  add column if not exists is_bill boolean not null default false;

-- ─── 3. bank_account_id on bms_payments / bms_expenses / bms_salary_payments ───
alter table public.bms_payments
  add column if not exists bank_account_id uuid
    references public.bms_bank_accounts(id) on delete set null;

alter table public.bms_expenses
  add column if not exists bank_account_id uuid
    references public.bms_bank_accounts(id) on delete set null;

alter table public.bms_salary_payments
  add column if not exists bank_account_id uuid
    references public.bms_bank_accounts(id) on delete set null;

create index if not exists bms_payments_bank_idx
  on public.bms_payments (building_id, bank_account_id);
create index if not exists bms_expenses_bank_idx
  on public.bms_expenses (building_id, bank_account_id);

-- ─── 4. RLS for bms_bank_accounts ───
alter table public.bms_bank_accounts enable row level security;

drop policy if exists bms_bank_accounts_select on public.bms_bank_accounts;
create policy bms_bank_accounts_select on public.bms_bank_accounts
  for select to authenticated
  using (
    bms_can_write_building(building_id)
    or (bms_current_role() = 'union' and building_id = bms_current_building())
  );

drop policy if exists bms_bank_accounts_write on public.bms_bank_accounts;
create policy bms_bank_accounts_write on public.bms_bank_accounts
  for all to authenticated
  using (bms_can_write_building(building_id))
  with check (bms_can_write_building(building_id));

-- ─── 5. Demo-mode restrictive deny policies (layer 2) ───
drop policy if exists bms_bank_accounts_demo_deny_ins on public.bms_bank_accounts;
create policy bms_bank_accounts_demo_deny_ins on public.bms_bank_accounts
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());

drop policy if exists bms_bank_accounts_demo_deny_upd on public.bms_bank_accounts;
create policy bms_bank_accounts_demo_deny_upd on public.bms_bank_accounts
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());

drop policy if exists bms_bank_accounts_demo_deny_del on public.bms_bank_accounts;
create policy bms_bank_accounts_demo_deny_del on public.bms_bank_accounts
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ─── 6. Seed default Cash bank account per existing building ───
-- Idempotent: only inserts when the building has no Cash account yet.
insert into public.bms_bank_accounts (
  building_id, name, type, opening_balance, opening_balance_date, is_active
)
select b.id, 'Cash', 'cash', 0, b.created_at::date, true
from public.bms_buildings b
where not exists (
  select 1 from public.bms_bank_accounts ba
  where ba.building_id = b.id and ba.type = 'cash'
);
