-- ============================================================
-- Pulse BMS — Project Funds (bms_projects + bms_project_shares)
--
-- Society-wide one-off fundraising drives (solar install, lift overhaul,
-- painting, Eid relief). Three contribution rules:
--   * equal:      every flat owes default_per_flat
--   * custom:     per-flat overrides via bms_project_shares
--   * voluntary:  any amount welcome, no per-flat target / defaulters
--
-- Multi-tenant via building_id. RLS mirrors bms_flat_credits:
--   * admin / super_admin:  full CRUD scoped to own building
--   * union:                full CRUD scoped to own building (creators
--                            per locked decision)
--   * resident:             SELECT scoped to own building (transparency
--                            level is enforced in UI based on
--                            bms_buildings.expose_defaulter_names)
--   * demo users:           blocked from writes (restrictive deny policies)
--
-- bms_payments gains:
--   * project_id FK to link a contribution to a project
--   * widened category check to include 'project'
-- ============================================================

-- ─── 1. Projects ─────────────────────────────────────────────────────
create table if not exists public.bms_projects (
  id                 uuid primary key default gen_random_uuid(),
  building_id        uuid not null references public.bms_buildings(id) on delete cascade,
  name               text not null,
  description        text,
  target_amount      numeric(14,2),                 -- nullable = open-ended (voluntary)
  contribution_rule  text not null check (contribution_rule in ('equal','custom','voluntary')),
  default_per_flat   numeric(14,2),                 -- used when rule='equal'
  start_date         date not null,
  end_date           date,                          -- nullable deadline
  status             text not null default 'active' check (status in ('active','closed','cancelled')),
  proposal_id        uuid references public.bms_proposals(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id)
);

create index if not exists bms_projects_building_idx on public.bms_projects (building_id, status);
create index if not exists bms_projects_proposal_idx on public.bms_projects (proposal_id) where proposal_id is not null;

drop trigger if exists bms_projects_touch on public.bms_projects;
create trigger bms_projects_touch
  before update on public.bms_projects
  for each row execute function public.bms_touch_updated_at();

-- ─── 2. Per-flat expected shares ─────────────────────────────────────
create table if not exists public.bms_project_shares (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.bms_projects(id) on delete cascade,
  flat_id         uuid not null references public.bms_flats(id) on delete cascade,
  expected_amount numeric(14,2) not null check (expected_amount >= 0),
  created_at      timestamptz not null default now(),
  unique (project_id, flat_id)
);

create index if not exists bms_project_shares_project_idx on public.bms_project_shares (project_id);
create index if not exists bms_project_shares_flat_idx    on public.bms_project_shares (flat_id);

-- ─── 3. Payments → project link ──────────────────────────────────────
alter table public.bms_payments
  add column if not exists project_id uuid references public.bms_projects(id) on delete set null;

create index if not exists bms_payments_project_idx
  on public.bms_payments (project_id) where project_id is not null;

-- Widen category check to allow 'project' contributions
alter table public.bms_payments
  drop constraint if exists bms_payments_category_check;
alter table public.bms_payments
  add constraint bms_payments_category_check
  check (category = any (array[
    'maintenance', 'entry_fee', 'fine', 'other', 'credit_carryforward', 'project'
  ]));

-- ─── 4. RLS ──────────────────────────────────────────────────────────
alter table public.bms_projects       enable row level security;
alter table public.bms_project_shares enable row level security;

-- ── bms_projects SELECT: anyone in the building ──
drop policy if exists bms_projects_select on public.bms_projects;
create policy bms_projects_select on public.bms_projects
  for select to authenticated
  using (
    bms_in_building(building_id)
    or (bms_current_role() = 'union'   and building_id = bms_current_building())
    or (bms_current_role() = 'resident' and building_id = bms_current_building())
  );

-- ── bms_projects WRITE: admin + union + super_admin (creators per spec) ──
drop policy if exists bms_projects_write on public.bms_projects;
create policy bms_projects_write on public.bms_projects
  for all to authenticated
  using (
    bms_can_write_building(building_id)
    or (bms_current_role() = 'union' and building_id = bms_current_building())
  )
  with check (
    bms_can_write_building(building_id)
    or (bms_current_role() = 'union' and building_id = bms_current_building())
  );

-- ── bms_project_shares SELECT: same scope as the parent project ──
drop policy if exists bms_project_shares_select on public.bms_project_shares;
create policy bms_project_shares_select on public.bms_project_shares
  for select to authenticated
  using (
    project_id in (
      select id from public.bms_projects p
      where bms_in_building(p.building_id)
         or (bms_current_role() = 'union'   and p.building_id = bms_current_building())
         or (bms_current_role() = 'resident' and p.building_id = bms_current_building())
    )
  );

-- ── bms_project_shares WRITE: admin + union + super_admin ──
drop policy if exists bms_project_shares_write on public.bms_project_shares;
create policy bms_project_shares_write on public.bms_project_shares
  for all to authenticated
  using (
    project_id in (
      select id from public.bms_projects p
      where bms_can_write_building(p.building_id)
         or (bms_current_role() = 'union' and p.building_id = bms_current_building())
    )
  )
  with check (
    project_id in (
      select id from public.bms_projects p
      where bms_can_write_building(p.building_id)
         or (bms_current_role() = 'union' and p.building_id = bms_current_building())
    )
  );

-- ─── 5. Demo-mode restrictive deny policies (layer 2) ────────────────
drop policy if exists bms_projects_demo_deny_ins on public.bms_projects;
create policy bms_projects_demo_deny_ins on public.bms_projects
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_projects_demo_deny_upd on public.bms_projects;
create policy bms_projects_demo_deny_upd on public.bms_projects
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_projects_demo_deny_del on public.bms_projects;
create policy bms_projects_demo_deny_del on public.bms_projects
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

drop policy if exists bms_project_shares_demo_deny_ins on public.bms_project_shares;
create policy bms_project_shares_demo_deny_ins on public.bms_project_shares
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_project_shares_demo_deny_upd on public.bms_project_shares;
create policy bms_project_shares_demo_deny_upd on public.bms_project_shares
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_project_shares_demo_deny_del on public.bms_project_shares;
create policy bms_project_shares_demo_deny_del on public.bms_project_shares
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());
