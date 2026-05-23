-- ============================================================
-- BMS: Sales leads / CRM
-- ============================================================
-- Super-admin-only table tracking prospect societies (buildings that
-- haven't yet onboarded). NOT scoped to building_id — these are
-- pre-customer entities. Owned by the super_admin who created them.
-- ============================================================

create type bms_lead_status as enum (
  'new', 'contacted', 'demo_done', 'negotiating',
  'won', 'lost', 'dormant'
);

create type bms_lead_temperature as enum ('hot', 'warm', 'cold');

create type bms_lead_source as enum (
  'cold_visit', 'referral', 'whatsapp_inbound', 'event', 'other'
);

create type bms_lead_role as enum (
  'president', 'treasurer', 'secretary', 'member', 'admin', 'other'
);

create type bms_lead_activity_type as enum (
  'note', 'call', 'whatsapp_sent', 'whatsapp_received',
  'meeting', 'demo', 'quote_sent', 'status_change'
);

create table public.bms_leads (
  id uuid primary key default gen_random_uuid(),
  building_name text not null,
  area text,
  city text default 'Karachi',
  flat_count_estimate int,
  contact_name text not null,
  contact_role bms_lead_role not null default 'other',
  whatsapp_number text not null,
  email text,
  source bms_lead_source not null default 'cold_visit',
  status bms_lead_status not null default 'new',
  temperature bms_lead_temperature not null default 'warm',
  next_followup_date date,
  quoted_amount numeric(12, 2),
  notes text,
  owner_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft-delete via status='dormant' rather than DELETE. Keeps history.
  archived_at timestamptz
);

create index bms_leads_status_idx on public.bms_leads (status) where archived_at is null;
create index bms_leads_followup_idx on public.bms_leads (next_followup_date) where archived_at is null and next_followup_date is not null;
create index bms_leads_owner_idx on public.bms_leads (owner_id);
create index bms_leads_created_idx on public.bms_leads (created_at desc);

create table public.bms_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.bms_leads(id) on delete cascade,
  activity_type bms_lead_activity_type not null,
  note text,
  meta jsonb,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index bms_lead_activities_lead_idx on public.bms_lead_activities (lead_id, created_at desc);

-- updated_at trigger
create or replace function public.bms_leads_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger bms_leads_updated_at_trg
  before update on public.bms_leads
  for each row execute function public.bms_leads_set_updated_at();

-- RLS: super_admin only
alter table public.bms_leads enable row level security;
alter table public.bms_lead_activities enable row level security;

-- Policies. We inline the role check against bms_profiles so this migration
-- has no dependency on a helper function existing yet.
create policy bms_leads_super_admin_all on public.bms_leads
  for all to authenticated
  using (
    exists (
      select 1 from public.bms_profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.bms_profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy bms_lead_activities_super_admin_all on public.bms_lead_activities
  for all to authenticated
  using (
    exists (
      select 1 from public.bms_profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.bms_profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

comment on table public.bms_leads is
  'Sales CRM — prospect societies pre-onboarding. Super-admin only. Not multi-tenant; no building_id (these are not yet customers).';
comment on table public.bms_lead_activities is
  'Append-only activity log per lead: calls, WhatsApp, meetings, demos, status changes.';
