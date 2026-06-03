-- ============================================================
-- Pulse BMS — Utility Bill Account Numbers
--
-- Allows admins and residents to register utility account numbers
-- (KE, KWSB, SSGC, etc.) per flat. Admins can verify submissions
-- from residents and add custom utility types for their building.
--
-- Two tables:
--   bms_utility_types    — catalogue of utility providers (system + per-building)
--   bms_utility_accounts — flat-level account numbers for each utility
--
-- System types (is_system=true, building_id IS NULL) are seeded and
-- shared across all buildings. Each building can add its own custom
-- types (building_id IS NOT NULL, is_system=false).
--
-- Multi-tenant: every bms_utility_accounts row carries building_id.
-- RLS mirrors bms_bill_accounts; residents can read/write their own flat.
-- ============================================================

-- ─── 1. Utility Types ────────────────────────────────────────────────
create table if not exists public.bms_utility_types (
  id           uuid        primary key default gen_random_uuid(),
  building_id  uuid        references public.bms_buildings(id) on delete cascade,
  name         text        not null,
  code         text,
  is_system    boolean     not null default false,
  sort_order   integer     not null default 99,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now()
);

-- System-wide types: unique by name where building_id IS NULL
create unique index if not exists bms_utility_types_system_name_uniq
  on public.bms_utility_types (name)
  where building_id is null;

-- Per-building custom types: unique by (building_id, name)
create unique index if not exists bms_utility_types_building_name_uniq
  on public.bms_utility_types (building_id, name)
  where building_id is not null;

create index if not exists bms_utility_types_building_idx
  on public.bms_utility_types (building_id, is_active);

-- ─── 2. Utility Accounts ─────────────────────────────────────────────
create table if not exists public.bms_utility_accounts (
  id                    uuid        primary key default gen_random_uuid(),
  building_id           uuid        not null references public.bms_buildings(id) on delete cascade,
  flat_id               uuid        not null references public.bms_flats(id) on delete cascade,
  utility_type_id       uuid        not null references public.bms_utility_types(id),
  account_number        text        not null,
  account_holder_name   text,
  notes                 text,
  submitted_by_resident boolean     not null default false,
  is_verified           boolean     not null default false,
  is_active             boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (flat_id, utility_type_id)
);

create index if not exists bms_utility_accounts_building_idx
  on public.bms_utility_accounts (building_id, is_active);

create index if not exists bms_utility_accounts_flat_idx
  on public.bms_utility_accounts (flat_id);

create index if not exists bms_utility_accounts_type_idx
  on public.bms_utility_accounts (utility_type_id);

-- updated_at auto-touch trigger
drop trigger if exists bms_utility_accounts_touch on public.bms_utility_accounts;
create trigger bms_utility_accounts_touch
  before update on public.bms_utility_accounts
  for each row execute function public.bms_touch_updated_at();

-- ─── 3. RLS — bms_utility_types ──────────────────────────────────────
alter table public.bms_utility_types enable row level security;

-- SELECT: any authenticated user can read system types or active types
-- belonging to their own building
drop policy if exists bms_utility_types_select on public.bms_utility_types;
create policy bms_utility_types_select on public.bms_utility_types
  for select to authenticated
  using (
    is_active = true
    and (
      building_id is null                        -- system-wide types visible to all
      or bms_in_building(building_id)            -- admin / super_admin in-building
      or building_id = bms_current_building()    -- union / resident / guard in their building
    )
  );

-- INSERT: super_admin (any), admin (own building, non-system only)
drop policy if exists bms_utility_types_insert on public.bms_utility_types;
create policy bms_utility_types_insert on public.bms_utility_types
  for insert to authenticated
  with check (
    (bms_current_role() = 'super_admin')
    or (
      bms_current_role() = 'admin'
      and building_id = bms_current_building()
      and is_system = false
    )
  );

-- UPDATE: super_admin (any), admin (own building non-system rows only)
drop policy if exists bms_utility_types_update on public.bms_utility_types;
create policy bms_utility_types_update on public.bms_utility_types
  for update to authenticated
  using (
    (bms_current_role() = 'super_admin')
    or (
      bms_current_role() = 'admin'
      and building_id = bms_current_building()
      and is_system = false
    )
  )
  with check (
    (bms_current_role() = 'super_admin')
    or (
      bms_current_role() = 'admin'
      and building_id = bms_current_building()
      and is_system = false
    )
  );

-- DELETE: super_admin (any), admin (own building non-system rows only)
drop policy if exists bms_utility_types_delete on public.bms_utility_types;
create policy bms_utility_types_delete on public.bms_utility_types
  for delete to authenticated
  using (
    (bms_current_role() = 'super_admin')
    or (
      bms_current_role() = 'admin'
      and building_id = bms_current_building()
      and is_system = false
    )
  );

-- ─── 4. RLS — bms_utility_accounts ───────────────────────────────────
alter table public.bms_utility_accounts enable row level security;

-- SELECT:
--   super_admin: all rows
--   admin: their building
--   resident: only their flat's rows
--   union/guard: no access (not in scope)
drop policy if exists bms_utility_accounts_select on public.bms_utility_accounts;
create policy bms_utility_accounts_select on public.bms_utility_accounts
  for select to authenticated
  using (
    bms_can_write_building(building_id)   -- super_admin + admin (in-building)
    or (
      bms_current_role() = 'resident'
      and flat_id = (
        select r.flat_id
          from public.bms_residents r
         where r.profile_id = auth.uid()
           and r.is_active = true
         limit 1
      )
    )
  );

-- INSERT/UPDATE/DELETE for admin + super_admin via bms_can_write_building
drop policy if exists bms_utility_accounts_write on public.bms_utility_accounts;
create policy bms_utility_accounts_write on public.bms_utility_accounts
  for all to authenticated
  using (bms_can_write_building(building_id))
  with check (bms_can_write_building(building_id));

-- Resident INSERT: only for their own flat, must mark submitted_by_resident
drop policy if exists bms_utility_accounts_resident_insert on public.bms_utility_accounts;
create policy bms_utility_accounts_resident_insert on public.bms_utility_accounts
  for insert to authenticated
  with check (
    bms_current_role() = 'resident'
    and submitted_by_resident = true
    and flat_id = (
      select r.flat_id
        from public.bms_residents r
       where r.profile_id = auth.uid()
         and r.is_active = true
       limit 1
    )
    and building_id = (
      select r.building_id
        from public.bms_residents r
       where r.profile_id = auth.uid()
         and r.is_active = true
       limit 1
    )
  );

-- Resident UPDATE: only their own flat's rows, must keep submitted_by_resident = true
drop policy if exists bms_utility_accounts_resident_update on public.bms_utility_accounts;
create policy bms_utility_accounts_resident_update on public.bms_utility_accounts
  for update to authenticated
  using (
    bms_current_role() = 'resident'
    and flat_id = (
      select r.flat_id
        from public.bms_residents r
       where r.profile_id = auth.uid()
         and r.is_active = true
       limit 1
    )
  )
  with check (
    submitted_by_resident = true
  );

-- Demo-mode restrictive deny
drop policy if exists bms_utility_accounts_demo_deny_ins on public.bms_utility_accounts;
create policy bms_utility_accounts_demo_deny_ins on public.bms_utility_accounts
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());

drop policy if exists bms_utility_accounts_demo_deny_upd on public.bms_utility_accounts;
create policy bms_utility_accounts_demo_deny_upd on public.bms_utility_accounts
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());

drop policy if exists bms_utility_accounts_demo_deny_del on public.bms_utility_accounts;
create policy bms_utility_accounts_demo_deny_del on public.bms_utility_accounts
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ─── 5. Seed system utility types ────────────────────────────────────
insert into public.bms_utility_types (name, code, is_system, sort_order)
values
  ('KE (Karachi Electric)',     'KE',    true, 1),
  ('KWSB (Water & Sewerage)',   'KWSB',  true, 2),
  ('SSGC (Sui Southern Gas)',   'SSGC',  true, 3),
  ('Other',                     'OTHER', true, 99)
on conflict do nothing;
