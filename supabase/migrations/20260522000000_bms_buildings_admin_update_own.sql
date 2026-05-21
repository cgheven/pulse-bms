-- Allow admins to UPDATE their own building. Previously `bms_buildings_write`
-- only permitted super_admin, so admin saves to opening_balance / settings
-- silently affected 0 rows (PostgREST swallows the row-count, action toast
-- reported success, DB unchanged).
--
-- Admin (= President in PK society convention) owns building-level
-- settings — Opening Fund Balance and any future building-scoped config.
-- Scoped to the caller's own building via bms_current_building().
-- Demo-deny restrictive policies still apply on top.

drop policy if exists bms_buildings_admin_update on public.bms_buildings;
create policy bms_buildings_admin_update on public.bms_buildings
  for update to authenticated
  using (id = bms_current_building())
  with check (id = bms_current_building());
