-- ============================================================
-- Pulse BMS — Flat Credit Balances (bms_flat_credits)
--
-- Pakistani maintenance flows often involve chunked payments and the
-- occasional overpayment (a resident pays Rs. 8,000 against a Rs. 5,000
-- invoice). The surplus must NOT vanish silently — it carries forward.
--
-- A credit row represents an unspent surplus belonging to a flat.
--   * applied_invoice_id IS NULL  → row is OPEN, ready to consume
--   * applied_invoice_id set      → row is CLOSED, the surplus was
--                                    converted into a payment against
--                                    that invoice (audit trail preserved)
--
-- Multi-tenant via building_id (every row). RLS mirrors bms_payments:
--   * super_admin: all rows
--   * admin: full CRUD scoped to their building (bms_can_write_building)
--   * union: SELECT on their building
--   * resident: SELECT on credits for any flat they occupy (bms_my_flat_ids)
--   * demo users: blocked from writes (restrictive deny policies, layer 2)
-- ============================================================

-- ─── 1. Table ───
create table if not exists public.bms_flat_credits (
  id                  uuid primary key default gen_random_uuid(),
  building_id         uuid not null references public.bms_buildings(id) on delete cascade,
  -- restrict so we don't lose audit trail of overpayments when a flat is removed
  flat_id             uuid not null references public.bms_flats(id) on delete restrict,
  amount              numeric(12,2) not null check (amount >= 0),
  source_payment_id   uuid references public.bms_payments(id) on delete set null,
  applied_invoice_id  uuid references public.bms_invoices(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id)
);

-- Hot path: looking up OPEN credits for a flat. Filter on applied_invoice_id IS NULL
-- happens at the DB layer; index helps either way (flat_id is the primary lookup column).
create index if not exists bms_flat_credits_flat_idx
  on public.bms_flat_credits (flat_id, applied_invoice_id);
create index if not exists bms_flat_credits_building_idx
  on public.bms_flat_credits (building_id);

-- ─── 2. RLS ───
alter table public.bms_flat_credits enable row level security;

-- SELECT mirrors bms_payments_select: admin/super_admin/union by building, resident by occupied flats
drop policy if exists bms_flat_credits_select on public.bms_flat_credits;
create policy bms_flat_credits_select on public.bms_flat_credits
  for select to authenticated
  using (
    bms_can_write_building(building_id)
    or (bms_current_role() = 'union' and building_id = bms_current_building())
    or flat_id in (select bms_my_flat_ids())
  );

-- WRITE: admin / super_admin within building only.
drop policy if exists bms_flat_credits_write on public.bms_flat_credits;
create policy bms_flat_credits_write on public.bms_flat_credits
  for all to authenticated
  using (bms_can_write_building(building_id))
  with check (bms_can_write_building(building_id));

-- ─── 2b. Widen bms_payments enums to support credit carry-forward ───
-- Overpayments that auto-apply to next month are recorded as a real payment
-- row with payment_mode='credit_carryforward' so the receipt PDF can render
-- it. Also add 'fine' to the category check — types/index.ts already
-- references it but the DB constraint was missing it.
alter table public.bms_payments
  drop constraint if exists bms_payments_payment_mode_check;
alter table public.bms_payments
  add constraint bms_payments_payment_mode_check
  check (payment_mode = any (array[
    'cash', 'bank', 'online', 'cheque', 'credit_carryforward'
  ]));

alter table public.bms_payments
  drop constraint if exists bms_payments_category_check;
alter table public.bms_payments
  add constraint bms_payments_category_check
  check (category = any (array[
    'maintenance', 'entry_fee', 'fine', 'other', 'credit_carryforward'
  ]));

-- ─── 3. Demo-mode restrictive deny policies (layer 2, mirrors demo migration) ───
drop policy if exists bms_flat_credits_demo_deny_ins on public.bms_flat_credits;
create policy bms_flat_credits_demo_deny_ins on public.bms_flat_credits
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_flat_credits_demo_deny_upd on public.bms_flat_credits;
create policy bms_flat_credits_demo_deny_upd on public.bms_flat_credits
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_flat_credits_demo_deny_del on public.bms_flat_credits;
create policy bms_flat_credits_demo_deny_del on public.bms_flat_credits
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());
