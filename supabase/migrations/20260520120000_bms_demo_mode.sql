-- ============================================================
-- Pulse BMS — Demo Mode (read-only demo accounts)
--
-- Defense-in-depth, layer 2:
--   * adds is_demo flag on bms_profiles
--   * exposes bms_is_demo_user() helper that returns true when the
--     currently authenticated user has is_demo = true
--   * stacks RESTRICTIVE deny policies on every bms_* write table for
--     INSERT/UPDATE/DELETE so that even if an attacker bypasses the
--     server action guard, the database refuses writes.
--
-- Why three separate restrictive policies per table instead of FOR ALL?
--   FOR ALL also covers SELECT — a restrictive `not is_demo` on SELECT
--   would block demo users from seeing the demo data we just created for
--   them. We only want to block mutations, so SELECT stays open.
--
-- Layer 1 (the primary guard) lives in app code: requireNotDemo() in
-- lib/auth.ts, called from every mutation server action.
--
-- RESTRICTIVE policies AND together with the existing permissive role/
-- building policies — they only ever subtract privileges. The original
-- policies still apply, so admins/union/residents keep their normal
-- read+write behaviour for non-demo accounts.
-- ============================================================

-- ─── 1. Column ───
alter table public.bms_profiles
  add column if not exists is_demo boolean not null default false;

create index if not exists bms_profiles_is_demo_idx
  on public.bms_profiles (is_demo) where is_demo;

-- ─── 2. Helper function ───
-- Stable + security definer so policies can call it cheaply and it can
-- read bms_profiles regardless of the calling user's RLS context.
create or replace function public.bms_is_demo_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_demo from public.bms_profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.bms_is_demo_user() to authenticated;
grant execute on function public.bms_is_demo_user() to anon;

-- ─── 3. Restrictive deny-write policies ───
-- One block per write-heavy bms_* table. The pattern is repeated rather than
-- DO-looped so the policies are visible in pg_policies and easy to audit.
-- Each block stacks three restrictive policies (insert / update / delete)
-- that all fail when the caller is a demo user. SELECT is intentionally
-- not restricted so demo accounts can browse the seeded demo data.

-- ── bms_buildings ──
drop policy if exists bms_buildings_demo_deny_ins on public.bms_buildings;
create policy bms_buildings_demo_deny_ins on public.bms_buildings
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_buildings_demo_deny_upd on public.bms_buildings;
create policy bms_buildings_demo_deny_upd on public.bms_buildings
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_buildings_demo_deny_del on public.bms_buildings;
create policy bms_buildings_demo_deny_del on public.bms_buildings
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_flats ──
drop policy if exists bms_flats_demo_deny_ins on public.bms_flats;
create policy bms_flats_demo_deny_ins on public.bms_flats
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_flats_demo_deny_upd on public.bms_flats;
create policy bms_flats_demo_deny_upd on public.bms_flats
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_flats_demo_deny_del on public.bms_flats;
create policy bms_flats_demo_deny_del on public.bms_flats
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_residents ──
drop policy if exists bms_residents_demo_deny_ins on public.bms_residents;
create policy bms_residents_demo_deny_ins on public.bms_residents
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_residents_demo_deny_upd on public.bms_residents;
create policy bms_residents_demo_deny_upd on public.bms_residents
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_residents_demo_deny_del on public.bms_residents;
create policy bms_residents_demo_deny_del on public.bms_residents
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_profiles ──
-- Demo users keep SELECT on their own profile (needed for the session
-- bootstrap) but cannot create / update / delete any profile rows.
drop policy if exists bms_profiles_demo_deny_ins on public.bms_profiles;
create policy bms_profiles_demo_deny_ins on public.bms_profiles
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_profiles_demo_deny_upd on public.bms_profiles;
create policy bms_profiles_demo_deny_upd on public.bms_profiles
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_profiles_demo_deny_del on public.bms_profiles;
create policy bms_profiles_demo_deny_del on public.bms_profiles
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_union_members ──
drop policy if exists bms_union_members_demo_deny_ins on public.bms_union_members;
create policy bms_union_members_demo_deny_ins on public.bms_union_members
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_union_members_demo_deny_upd on public.bms_union_members;
create policy bms_union_members_demo_deny_upd on public.bms_union_members
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_union_members_demo_deny_del on public.bms_union_members;
create policy bms_union_members_demo_deny_del on public.bms_union_members
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_elections ──
drop policy if exists bms_elections_demo_deny_ins on public.bms_elections;
create policy bms_elections_demo_deny_ins on public.bms_elections
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_elections_demo_deny_upd on public.bms_elections;
create policy bms_elections_demo_deny_upd on public.bms_elections
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_elections_demo_deny_del on public.bms_elections;
create policy bms_elections_demo_deny_del on public.bms_elections
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_meetings ──
drop policy if exists bms_meetings_demo_deny_ins on public.bms_meetings;
create policy bms_meetings_demo_deny_ins on public.bms_meetings
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_meetings_demo_deny_upd on public.bms_meetings;
create policy bms_meetings_demo_deny_upd on public.bms_meetings
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_meetings_demo_deny_del on public.bms_meetings;
create policy bms_meetings_demo_deny_del on public.bms_meetings
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_invoices ──
drop policy if exists bms_invoices_demo_deny_ins on public.bms_invoices;
create policy bms_invoices_demo_deny_ins on public.bms_invoices
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_invoices_demo_deny_upd on public.bms_invoices;
create policy bms_invoices_demo_deny_upd on public.bms_invoices
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_invoices_demo_deny_del on public.bms_invoices;
create policy bms_invoices_demo_deny_del on public.bms_invoices
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_payments ──
drop policy if exists bms_payments_demo_deny_ins on public.bms_payments;
create policy bms_payments_demo_deny_ins on public.bms_payments
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_payments_demo_deny_upd on public.bms_payments;
create policy bms_payments_demo_deny_upd on public.bms_payments
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_payments_demo_deny_del on public.bms_payments;
create policy bms_payments_demo_deny_del on public.bms_payments
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_staff ──
drop policy if exists bms_staff_demo_deny_ins on public.bms_staff;
create policy bms_staff_demo_deny_ins on public.bms_staff
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_staff_demo_deny_upd on public.bms_staff;
create policy bms_staff_demo_deny_upd on public.bms_staff
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_staff_demo_deny_del on public.bms_staff;
create policy bms_staff_demo_deny_del on public.bms_staff
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_attendance ──
drop policy if exists bms_attendance_demo_deny_ins on public.bms_attendance;
create policy bms_attendance_demo_deny_ins on public.bms_attendance
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_attendance_demo_deny_upd on public.bms_attendance;
create policy bms_attendance_demo_deny_upd on public.bms_attendance
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_attendance_demo_deny_del on public.bms_attendance;
create policy bms_attendance_demo_deny_del on public.bms_attendance
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_salary_payments ──
drop policy if exists bms_salary_payments_demo_deny_ins on public.bms_salary_payments;
create policy bms_salary_payments_demo_deny_ins on public.bms_salary_payments
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_salary_payments_demo_deny_upd on public.bms_salary_payments;
create policy bms_salary_payments_demo_deny_upd on public.bms_salary_payments
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_salary_payments_demo_deny_del on public.bms_salary_payments;
create policy bms_salary_payments_demo_deny_del on public.bms_salary_payments
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_expenses ──
drop policy if exists bms_expenses_demo_deny_ins on public.bms_expenses;
create policy bms_expenses_demo_deny_ins on public.bms_expenses
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_expenses_demo_deny_upd on public.bms_expenses;
create policy bms_expenses_demo_deny_upd on public.bms_expenses
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_expenses_demo_deny_del on public.bms_expenses;
create policy bms_expenses_demo_deny_del on public.bms_expenses
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_facility_tasks ──
drop policy if exists bms_facility_tasks_demo_deny_ins on public.bms_facility_tasks;
create policy bms_facility_tasks_demo_deny_ins on public.bms_facility_tasks
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_facility_tasks_demo_deny_upd on public.bms_facility_tasks;
create policy bms_facility_tasks_demo_deny_upd on public.bms_facility_tasks
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_facility_tasks_demo_deny_del on public.bms_facility_tasks;
create policy bms_facility_tasks_demo_deny_del on public.bms_facility_tasks
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_complaints ──
drop policy if exists bms_complaints_demo_deny_ins on public.bms_complaints;
create policy bms_complaints_demo_deny_ins on public.bms_complaints
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_complaints_demo_deny_upd on public.bms_complaints;
create policy bms_complaints_demo_deny_upd on public.bms_complaints
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_complaints_demo_deny_del on public.bms_complaints;
create policy bms_complaints_demo_deny_del on public.bms_complaints
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_notices ──
drop policy if exists bms_notices_demo_deny_ins on public.bms_notices;
create policy bms_notices_demo_deny_ins on public.bms_notices
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_notices_demo_deny_upd on public.bms_notices;
create policy bms_notices_demo_deny_upd on public.bms_notices
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_notices_demo_deny_del on public.bms_notices;
create policy bms_notices_demo_deny_del on public.bms_notices
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_proposals ──
drop policy if exists bms_proposals_demo_deny_ins on public.bms_proposals;
create policy bms_proposals_demo_deny_ins on public.bms_proposals
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_proposals_demo_deny_upd on public.bms_proposals;
create policy bms_proposals_demo_deny_upd on public.bms_proposals
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_proposals_demo_deny_del on public.bms_proposals;
create policy bms_proposals_demo_deny_del on public.bms_proposals
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_proposal_votes ──
drop policy if exists bms_proposal_votes_demo_deny_ins on public.bms_proposal_votes;
create policy bms_proposal_votes_demo_deny_ins on public.bms_proposal_votes
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_proposal_votes_demo_deny_upd on public.bms_proposal_votes;
create policy bms_proposal_votes_demo_deny_upd on public.bms_proposal_votes
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_proposal_votes_demo_deny_del on public.bms_proposal_votes;
create policy bms_proposal_votes_demo_deny_del on public.bms_proposal_votes
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_proposal_comments ──
drop policy if exists bms_proposal_comments_demo_deny_ins on public.bms_proposal_comments;
create policy bms_proposal_comments_demo_deny_ins on public.bms_proposal_comments
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_proposal_comments_demo_deny_upd on public.bms_proposal_comments;
create policy bms_proposal_comments_demo_deny_upd on public.bms_proposal_comments
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_proposal_comments_demo_deny_del on public.bms_proposal_comments;
create policy bms_proposal_comments_demo_deny_del on public.bms_proposal_comments
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_audit_log ──
-- Demo users shouldn't mutate, hence shouldn't write audit entries either.
-- (Service-role audit writes from the server bypass RLS, so this is purely
-- a backstop against direct PostgREST writes from a stolen demo JWT.)
drop policy if exists bms_audit_log_demo_deny_ins on public.bms_audit_log;
create policy bms_audit_log_demo_deny_ins on public.bms_audit_log
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_audit_log_demo_deny_upd on public.bms_audit_log;
create policy bms_audit_log_demo_deny_upd on public.bms_audit_log
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_audit_log_demo_deny_del on public.bms_audit_log;
create policy bms_audit_log_demo_deny_del on public.bms_audit_log
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_flat_listings ──
drop policy if exists bms_flat_listings_demo_deny_ins on public.bms_flat_listings;
create policy bms_flat_listings_demo_deny_ins on public.bms_flat_listings
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_flat_listings_demo_deny_upd on public.bms_flat_listings;
create policy bms_flat_listings_demo_deny_upd on public.bms_flat_listings
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_flat_listings_demo_deny_del on public.bms_flat_listings;
create policy bms_flat_listings_demo_deny_del on public.bms_flat_listings
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_services ──
drop policy if exists bms_services_demo_deny_ins on public.bms_services;
create policy bms_services_demo_deny_ins on public.bms_services
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_services_demo_deny_upd on public.bms_services;
create policy bms_services_demo_deny_upd on public.bms_services
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_services_demo_deny_del on public.bms_services;
create policy bms_services_demo_deny_del on public.bms_services
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_vehicles ──
drop policy if exists bms_vehicles_demo_deny_ins on public.bms_vehicles;
create policy bms_vehicles_demo_deny_ins on public.bms_vehicles
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_vehicles_demo_deny_upd on public.bms_vehicles;
create policy bms_vehicles_demo_deny_upd on public.bms_vehicles
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());
drop policy if exists bms_vehicles_demo_deny_del on public.bms_vehicles;
create policy bms_vehicles_demo_deny_del on public.bms_vehicles
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());
