-- Admin-controlled transparency toggles for the resident portal.
-- Both default false — admin must explicitly opt in to expose each section.

alter table public.bms_buildings
  add column if not exists show_building_funds boolean not null default false,
  add column if not exists show_defaulters     boolean not null default false;

comment on column public.bms_buildings.show_building_funds is
  'When true, residents can see the Building Funds section on the transparency page.';
comment on column public.bms_buildings.show_defaulters is
  'When true, residents can see the Defaulters list on the transparency page.';
