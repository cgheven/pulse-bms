-- Building service contacts directory
-- Admin manages; union + residents can read and call directly.

create table bms_service_contacts (
  id            uuid        default gen_random_uuid() primary key,
  building_id   uuid        not null references bms_buildings(id) on delete cascade,
  name          text        not null,
  trade         text        not null,      -- 'electrician' | 'plumber' | ...
  phone         text        not null,
  whatsapp      text,                      -- optional; if null, falls back to phone
  is_available  boolean     not null default true,
  notes         text,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table bms_service_contacts enable row level security;

-- Admin (and super_admin) can do everything scoped to their building.
create policy "bms_sc_admin_all" on bms_service_contacts
  for all
  using (
    exists (
      select 1 from bms_profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and (p.building_id = bms_service_contacts.building_id or p.role = 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from bms_profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and (p.building_id = bms_service_contacts.building_id or p.role = 'super_admin')
    )
  );

-- Union members can read contacts for their building.
create policy "bms_sc_union_read" on bms_service_contacts
  for select
  using (
    exists (
      select 1 from bms_profiles p
      where p.id = auth.uid()
        and p.role = 'union'
        and p.building_id = bms_service_contacts.building_id
    )
  );

-- Residents can read contacts for their building.
create policy "bms_sc_resident_read" on bms_service_contacts
  for select
  using (
    exists (
      select 1 from bms_profiles p
      where p.id = auth.uid()
        and p.role = 'resident'
        and p.building_id = bms_service_contacts.building_id
    )
  );

create index bms_service_contacts_building_idx on bms_service_contacts (building_id, sort_order);
