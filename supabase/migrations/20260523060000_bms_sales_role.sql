-- ============================================================
-- BMS: Sales-team role
-- ============================================================
-- Introduces a new restricted role `sales` (a.k.a. "team member") that
-- super_admin can provision to onboard sales reps. A sales user's ONLY
-- accessible surface is the Leads CRM — every other route either rejects
-- them in `requireRole(...)` and redirects, or is hidden from their
-- sidebar. They are NOT tied to a building (leads are pre-customer).
--
-- Changes:
--   1. Extend bms_profiles.role CHECK to allow 'sales'.
--   2. Recreate RLS policies on bms_leads + bms_lead_activities so they
--      accept role IN ('super_admin', 'sales') instead of just
--      'super_admin'.
-- ============================================================

-- 1. Extend role CHECK to allow 'sales'.
alter table public.bms_profiles drop constraint if exists bms_profiles_role_check;
alter table public.bms_profiles
  add constraint bms_profiles_role_check
  check (role in ('super_admin', 'admin', 'union', 'resident', 'sales'));

-- 2. Recreate leads RLS to include 'sales'.
drop policy if exists bms_leads_super_admin_all on public.bms_leads;
drop policy if exists bms_lead_activities_super_admin_all on public.bms_lead_activities;

create policy bms_leads_sales_or_super on public.bms_leads
  for all to authenticated
  using (
    exists (
      select 1 from public.bms_profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'sales')
    )
  )
  with check (
    exists (
      select 1 from public.bms_profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'sales')
    )
  );

create policy bms_lead_activities_sales_or_super on public.bms_lead_activities
  for all to authenticated
  using (
    exists (
      select 1 from public.bms_profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'sales')
    )
  )
  with check (
    exists (
      select 1 from public.bms_profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'sales')
    )
  );
