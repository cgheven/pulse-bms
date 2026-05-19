-- ============================================================
-- Pulse BMS — Vehicle Registry (bms_vehicles)
-- Per-flat / per-resident vehicle records.
-- Multi-tenant via building_id. RLS mirrors bms_residents.
-- ============================================================

-- ─── 1. Table ───
create table if not exists public.bms_vehicles (
  id              uuid primary key default gen_random_uuid(),
  building_id     uuid not null references public.bms_buildings(id) on delete cascade,
  -- restrict: don't silently shred vehicle history when a flat is deleted; force the
  -- admin to clean up vehicles first.
  flat_id         uuid not null references public.bms_flats(id) on delete restrict,
  resident_id     uuid references public.bms_residents(id) on delete set null,
  plate_number    text not null,
  vehicle_type    text not null check (vehicle_type in ('car','bike','ev','other')),
  make            text,
  model           text,
  color           text,
  is_primary      boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id)
);

create index if not exists bms_vehicles_building_idx     on public.bms_vehicles (building_id);
create index if not exists bms_vehicles_flat_idx         on public.bms_vehicles (flat_id);
create index if not exists bms_vehicles_resident_idx     on public.bms_vehicles (resident_id);
-- Unique per building: same plate cannot be registered twice in one building.
create unique index if not exists bms_vehicles_plate_unique
  on public.bms_vehicles (building_id, lower(plate_number));
-- One primary vehicle per flat. Backstop for the app-level demote-then-insert pattern;
-- racing inserts that both try is_primary=true → second one fails with a constraint
-- violation instead of corrupting state.
create unique index if not exists bms_vehicles_primary_per_flat
  on public.bms_vehicles (flat_id) where is_primary;

-- ─── 2. updated_at trigger (matches the bms_touch_updated_at function from 001) ───
drop trigger if exists bms_vehicles_touch on public.bms_vehicles;
create trigger bms_vehicles_touch
  before update on public.bms_vehicles
  for each row execute function public.bms_touch_updated_at();

-- ─── 3. RLS ───
alter table public.bms_vehicles enable row level security;

-- super_admin: full access (no building filter)
-- admin: full CRUD scoped to own building (bms_can_write_building covers this)
-- union: SELECT only, scoped to own building
-- resident: full CRUD on own vehicles (resident_id linked to their bms_residents row)

drop policy if exists bms_vehicles_select on public.bms_vehicles;
create policy bms_vehicles_select on public.bms_vehicles
  for select to authenticated
  using (
    bms_in_building(building_id)
    or resident_id in (
      select id from public.bms_residents where profile_id = auth.uid()
    )
  );

-- Resident inserts: only into own resident row, on a flat they actually occupy,
-- in their own building. Without the flat_id constraint a resident could insert a
-- vehicle pointing at someone else's flat and (via is_primary) demote that flat's
-- primary record.
drop policy if exists bms_vehicles_insert_resident on public.bms_vehicles;
create policy bms_vehicles_insert_resident on public.bms_vehicles
  for insert to authenticated
  with check (
    bms_can_write_building(building_id)
    or (
      resident_id in (
        select id from public.bms_residents
        where profile_id = auth.uid()
          and is_active = true
          and building_id = bms_vehicles.building_id
          and flat_id      = bms_vehicles.flat_id
      )
    )
  );

drop policy if exists bms_vehicles_update_resident on public.bms_vehicles;
create policy bms_vehicles_update_resident on public.bms_vehicles
  for update to authenticated
  using (
    bms_can_write_building(building_id)
    or resident_id in (
      select id from public.bms_residents
      where profile_id = auth.uid()
        and is_active = true
        and building_id = bms_vehicles.building_id
        and flat_id      = bms_vehicles.flat_id
    )
  )
  with check (
    bms_can_write_building(building_id)
    or resident_id in (
      select id from public.bms_residents
      where profile_id = auth.uid()
        and is_active = true
        and building_id = bms_vehicles.building_id
        and flat_id      = bms_vehicles.flat_id
    )
  );

drop policy if exists bms_vehicles_delete_resident on public.bms_vehicles;
create policy bms_vehicles_delete_resident on public.bms_vehicles
  for delete to authenticated
  using (
    bms_can_write_building(building_id)
    or resident_id in (
      select id from public.bms_residents where profile_id = auth.uid()
    )
  );
