-- ============================================================
-- Pulse BMS — Bill Accounts (bms_bill_accounts)
--
-- PK societies have 8+ utility connections (KE Block A/B/Lift, SSGC
-- Building/Generator, internet, lift AMC, security contract). Each has a
-- consumer / account number. Admins currently retype vendor + reference
-- every month. Bill Accounts are set up ONCE; monthly expenses link to
-- them via bms_expenses.bill_account_id; reports filter by account.
--
-- City-scoped provider list lives in lib/bill-providers.ts (Karachi-only
-- in v1). The provider key is stored as text — free-form "other" lets
-- societies in less-covered cities still add custom providers.
--
-- Soft delete via is_active boolean. Deactivating hides the row from the
-- expense form picker but keeps historical bills intact.
--
-- Multi-tenant via building_id. RLS mirrors bms_projects:
--   * admin + super_admin + union (in-building):  SELECT
--   * admin + super_admin (in-building):          INSERT/UPDATE/DELETE
--   * demo users:                                 blocked from writes
--                                                  (restrictive deny)
-- ============================================================

-- ─── 1. Bill Accounts table ──────────────────────────────────────────
create table if not exists public.bms_bill_accounts (
  id              uuid primary key default gen_random_uuid(),
  building_id     uuid not null references public.bms_buildings(id) on delete cascade,
  provider        text not null,                       -- provider key, e.g. 'k_electric', 'ssgc', 'other'
  provider_label  text,                                -- required when provider='other' (custom label)
  nickname        text not null,                       -- friendly name shown in UI ("Block A KE")
  account_number  text not null,                       -- consumer / connection / contract #
  location        text,                                -- "Block A", "Lift", "Common", etc.
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id)
);

create index if not exists bms_bill_accounts_building_idx
  on public.bms_bill_accounts (building_id, is_active);

create index if not exists bms_bill_accounts_provider_idx
  on public.bms_bill_accounts (building_id, provider) where is_active;

drop trigger if exists bms_bill_accounts_touch on public.bms_bill_accounts;
create trigger bms_bill_accounts_touch
  before update on public.bms_bill_accounts
  for each row execute function public.bms_touch_updated_at();

-- ─── 2. bms_expenses link ────────────────────────────────────────────
alter table public.bms_expenses
  add column if not exists bill_account_id uuid
    references public.bms_bill_accounts(id) on delete set null;

create index if not exists bms_expenses_bill_account_idx
  on public.bms_expenses (bill_account_id) where bill_account_id is not null;

-- ─── 3. RLS ──────────────────────────────────────────────────────────
alter table public.bms_bill_accounts enable row level security;

-- ── SELECT: admin + super_admin + union scoped to own building ──
drop policy if exists bms_bill_accounts_select on public.bms_bill_accounts;
create policy bms_bill_accounts_select on public.bms_bill_accounts
  for select to authenticated
  using (
    bms_in_building(building_id)
    or (bms_current_role() = 'union' and building_id = bms_current_building())
  );

-- ── WRITE: admin + super_admin only (union does NOT manage utility
-- accounts — that's an admin/treasurer task) ──
drop policy if exists bms_bill_accounts_write on public.bms_bill_accounts;
create policy bms_bill_accounts_write on public.bms_bill_accounts
  for all to authenticated
  using (bms_can_write_building(building_id))
  with check (bms_can_write_building(building_id));

-- ── Demo-mode restrictive deny (layer 2) ──
drop policy if exists bms_bill_accounts_demo_deny_ins on public.bms_bill_accounts;
create policy bms_bill_accounts_demo_deny_ins on public.bms_bill_accounts
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());

drop policy if exists bms_bill_accounts_demo_deny_upd on public.bms_bill_accounts;
create policy bms_bill_accounts_demo_deny_upd on public.bms_bill_accounts
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());

drop policy if exists bms_bill_accounts_demo_deny_del on public.bms_bill_accounts;
create policy bms_bill_accounts_demo_deny_del on public.bms_bill_accounts
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ─── 4. SECURITY DEFINER RPC: bms_update_building_info ───────────────
-- Admin can't UPDATE bms_buildings directly (write policy is super_admin
-- only). Mirror the bms_update_opening_balance pattern: narrow RPC that
-- whitelists `city`, validates role + tenant + demo, runs as definer.
create or replace function public.bms_update_building_info(
  p_city text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid := bms_current_building();
  v_role text;
  v_is_demo boolean;
begin
  if v_building_id is null then
    raise exception 'No building assigned';
  end if;

  select role, coalesce(is_demo, false)
    into v_role, v_is_demo
    from public.bms_profiles
   where id = auth.uid();

  if v_role not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  if v_is_demo then
    raise exception 'Demo accounts are read-only';
  end if;

  if p_city is null or btrim(p_city) = '' then
    raise exception 'City is required';
  end if;

  update public.bms_buildings
     set city = btrim(p_city)
   where id = v_building_id;
end;
$$;

revoke all on function public.bms_update_building_info(text) from public;
grant execute on function public.bms_update_building_info(text) to authenticated;
