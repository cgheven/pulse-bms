-- ============================================================
-- BMS: Per-activity follow-up date
-- ============================================================
-- Converts the single-date follow-up field on bms_leads into a
-- structured per-touchpoint trail. Each activity row may carry the
-- "schedule the next follow-up" date the rep agreed on during that
-- contact attempt. Optional — only set when the rep wants to lock in
-- the next touch.
--
-- The lead's existing bms_leads.next_followup_date column stays as a
-- denormalised convenience field (kept in sync by the logFollowup
-- server action to the latest followup_due_date across the lead's
-- activities) so KPI queries (Due-today / Overdue / dashboard widget)
-- continue working unchanged.
-- ============================================================

alter table public.bms_lead_activities
  add column if not exists followup_due_date date;

-- Partial index — common case is null, so we don't pay for it.
create index if not exists bms_lead_activities_followup_due_idx
  on public.bms_lead_activities (followup_due_date)
  where followup_due_date is not null;

comment on column public.bms_lead_activities.followup_due_date is
  'The next follow-up date scheduled by this contact attempt. Null means no follow-up was set in this activity. The lead''s denormalized bms_leads.next_followup_date is kept in sync with the latest non-null value across this lead''s activities.';
