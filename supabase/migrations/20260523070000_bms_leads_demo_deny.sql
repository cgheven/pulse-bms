-- ============================================================
-- Pulse BMS — Demo-deny restrictive policies for the Leads CRM.
--
-- The Leads CRM (bms_leads + bms_lead_activities) was added AFTER the
-- main demo-mode migration (20260520120000_bms_demo_mode.sql) shipped,
-- so those two tables never received the standard restrictive deny-
-- write policies that every other bms_* write table carries.
--
-- This migration backfills them, mirroring the exact pattern used in
-- the demo-mode migration: three restrictive policies per table
-- (insert / update / delete) that reject any caller whose
-- bms_profiles.is_demo = true. SELECT stays open so demo users keep
-- read access to seeded demo data.
--
-- Restrictive policies AND together with the existing permissive
-- super_admin/sales policies, so non-demo users are unaffected.
--
-- This is defence-in-depth — the primary guard is requireNotDemo() in
-- the leads server actions (lib/auth.ts).
-- ============================================================

-- ── bms_leads ──
drop policy if exists bms_leads_demo_deny_ins on public.bms_leads;
create policy bms_leads_demo_deny_ins on public.bms_leads
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());

drop policy if exists bms_leads_demo_deny_upd on public.bms_leads;
create policy bms_leads_demo_deny_upd on public.bms_leads
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());

drop policy if exists bms_leads_demo_deny_del on public.bms_leads;
create policy bms_leads_demo_deny_del on public.bms_leads
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

-- ── bms_lead_activities ──
drop policy if exists bms_lead_activities_demo_deny_ins on public.bms_lead_activities;
create policy bms_lead_activities_demo_deny_ins on public.bms_lead_activities
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());

drop policy if exists bms_lead_activities_demo_deny_upd on public.bms_lead_activities;
create policy bms_lead_activities_demo_deny_upd on public.bms_lead_activities
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user())
  with check (not public.bms_is_demo_user());

drop policy if exists bms_lead_activities_demo_deny_del on public.bms_lead_activities;
create policy bms_lead_activities_demo_deny_del on public.bms_lead_activities
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());
