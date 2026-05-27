-- ============================================================
-- BMS: Guard role
-- ============================================================
-- Introduces a new restricted role `guard` (security guard) whose ONLY
-- accessible surface is the vehicle look-up portal at /guard.
-- A guard is scoped to a single building via building_id on their profile.
--
-- What a guard CAN do:
--   * SELECT bms_vehicles  — plate, type, make, model, color, flat_id, resident_id
--   * SELECT bms_residents — full_name, relationship (to show who owns the vehicle)
--   * SELECT bms_flats     — flat_number (to display which flat a vehicle belongs to)
--
-- What a guard CANNOT do:
--   * Any INSERT / UPDATE / DELETE on any table
--   * Access bms_payments, bms_invoices, bms_expenses, bms_audit_log, or any
--     other table not listed above (RLS deny-by-default covers this — no new
--     policies are added for those tables, so the guard's token is rejected)
--
-- Changes:
--   1. Extend bms_profiles.role CHECK to allow 'guard'.
--   2. Add SELECT-only RLS policy on bms_vehicles for guard.
--   3. Add SELECT-only RLS policy on bms_residents for guard.
--   4. Add SELECT-only RLS policy on bms_flats for guard.
-- ============================================================

-- ─── 1. Extend role CHECK to allow 'guard' ───────────────────────────────────
-- Drop the current constraint (set by the sales-role migration) and recreate it
-- with 'guard' appended. Idempotent: the constraint name is stable.
alter table public.bms_profiles
  drop constraint if exists bms_profiles_role_check;

alter table public.bms_profiles
  add constraint bms_profiles_role_check
  check (role in ('super_admin', 'admin', 'union', 'resident', 'sales', 'guard'));

-- ─── 2. bms_vehicles — guard SELECT ──────────────────────────────────────────
-- Guard can see all vehicle rows in their own building (for plate look-up).
-- The existing bms_vehicles_select policy already covers admin/union/resident;
-- we add a second permissive policy dedicated to guard so the guard's building
-- scope is explicit and independent of the other roles' logic.
drop policy if exists bms_vehicles_guard_select on public.bms_vehicles;
create policy bms_vehicles_guard_select on public.bms_vehicles
  for select to authenticated
  using (
    bms_current_role() = 'guard'
    and building_id = bms_current_building()
  );

-- ─── 3. bms_residents — guard SELECT ─────────────────────────────────────────
-- Guard may read resident name and relationship to identify who a vehicle
-- belongs to. Sensitive fields (CNIC, phone, email) live on this row too, but
-- column-level access control is enforced in the application layer (the guard
-- query only selects full_name, relationship, flat_id, is_active, is_primary).
-- The DB-level policy ensures the guard cannot read residents from other
-- buildings.
drop policy if exists bms_residents_guard_select on public.bms_residents;
create policy bms_residents_guard_select on public.bms_residents
  for select to authenticated
  using (
    bms_current_role() = 'guard'
    and building_id = bms_current_building()
  );

-- ─── 4. bms_flats — guard SELECT ─────────────────────────────────────────────
-- Guard needs the flat_number to display alongside a vehicle match
-- (e.g. "Flat 4A — Honda Civic ABC-123").
drop policy if exists bms_flats_guard_select on public.bms_flats;
create policy bms_flats_guard_select on public.bms_flats
  for select to authenticated
  using (
    bms_current_role() = 'guard'
    and building_id = bms_current_building()
  );

-- ─── 5. bms_profiles — guard self-read ───────────────────────────────────────
-- The session bootstrap (getSession in lib/auth.ts) reads the caller's own
-- bms_profiles row via the admin/service-role client, which bypasses RLS.
-- No additional policy is needed here. This comment is intentional so future
-- engineers know this was considered.
