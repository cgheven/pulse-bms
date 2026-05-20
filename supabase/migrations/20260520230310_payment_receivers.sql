-- ============================================================
-- Pulse BMS — Payment receivers + union INSERT policy
--
-- Adds three columns to bms_payments so every payment row records
-- WHO physically received the cash:
--   * received_by_profile_id — FK to the recording profile (admin or
--     union). NULL when super_admin or in pre-existing rows.
--   * received_by_name — denormalized snapshot of full_name at time of
--     insert. Survives profile deletion / rename.
--   * received_by_position — denormalized committee position label
--     ("President", "Treasurer", ...) from bms_union_members. Survives
--     committee changes.
--
-- Also grants union role INSERT capability on bms_payments — union
-- members (Treasurer, Secretary, etc.) collect cash door-to-door just
-- like the President (admin role).
--
-- Demo deny restrictive policies on bms_payments are untouched (defined
-- in 20260520120000_bms_demo_mode.sql). They stack with the new
-- permissive policy and still block demo accounts from writing.
-- ============================================================

-- ─── Columns ───
alter table public.bms_payments
  add column if not exists received_by_profile_id uuid references public.bms_profiles(id) on delete set null,
  add column if not exists received_by_name text,
  add column if not exists received_by_position text;

create index if not exists bms_payments_received_by_idx
  on public.bms_payments (building_id, received_by_profile_id);

-- ─── Union INSERT policy ───
-- Existing `bms_payments_write` is FOR ALL but `bms_can_write_building()`
-- only matches admin / super_admin. Union members need to record cash
-- collections from their own building. Permissive policies OR together,
-- so this widens INSERT without affecting the existing admin path.
--
-- Scoped strictly to the union member's own building_id (via
-- bms_current_building / bms_current_role). The demo deny restrictive
-- policy still applies as a backstop.
drop policy if exists bms_payments_union_insert on public.bms_payments;
create policy bms_payments_union_insert on public.bms_payments
  for insert to authenticated
  with check (
    bms_current_role() = 'union'
    and building_id = bms_current_building()
  );
