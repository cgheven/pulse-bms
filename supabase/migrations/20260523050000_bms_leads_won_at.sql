-- ============================================================
-- BMS: bms_leads.won_at — accurate "Won this month" KPI
-- ============================================================
-- The KPI used to read `status='won' AND updated_at >= monthStart`.
-- Any subsequent edit (notes, etc.) bumps updated_at, which double-
-- counted a deal months after it closed. Capture the actual "won"
-- timestamp on a dedicated column so the KPI is stable.
-- ============================================================

alter table public.bms_leads
  add column if not exists won_at timestamptz;

-- Backfill: any existing leads with status='won' get won_at from the
-- newest matching status_change activity, else from updated_at.
update public.bms_leads l
   set won_at = coalesce(
     (select max(a.created_at)
        from public.bms_lead_activities a
       where a.lead_id = l.id
         and a.activity_type = 'status_change'
         and a.meta->>'to' = 'won'),
     l.updated_at
   )
 where l.status = 'won' and l.won_at is null;

create index if not exists bms_leads_won_at_idx
  on public.bms_leads (won_at desc) where won_at is not null;

comment on column public.bms_leads.won_at is
  'Timestamp the lead first transitioned to status=won. Cleared if the lead later moves away from won. Drives the "Won this month" KPI.';
