-- ============================================================================
-- Pulse platform billing  —  "Pulse bills its own clients"
-- ============================================================================
-- This is the SaaS-vendor billing layer: PulseHub invoicing each client
-- BUILDING for its Pulse BMS subscription. It is completely separate from
-- bms_invoices / bms_payments, which are the building's own maintenance
-- billing of its residents. Do not confuse the two.
--
-- Two tables:
--   bms_client_billing     — per-building billing CONFIG (one row per building)
--   bms_platform_invoices  — generated invoices, each one a full SNAPSHOT of
--                            the pricing inputs that produced its amount
--
-- SNAPSHOT DISCIPLINE (the whole point):
--   Every invoice freezes flats_count, standard_monthly_rate, monthly_rate,
--   discount_pct, standard_amount, subscription_amount, onboarding_fee_charged
--   and is_first_invoice at generation time. The PDF renders ONLY from these
--   columns. A historical invoice must never change when the building adds
--   flats, the tier table is repriced, or the client renegotiates.
--
-- RELATIONSHIP TO bms_buildings.pulse_monthly_charge:
--   That column (added 20260607000004) is SUPERSEDED, not reused. It is a
--   single nullable numeric with no cycle, no waiver, no anchor date and no
--   history — insufficient to invoice from. bms_client_billing.monthly_rate
--   becomes the single source of truth for invoicing. We BACKFILL from
--   pulse_monthly_charge below and deliberately LEAVE THE OLD COLUMN IN PLACE
--   so the Trials UI (app/(super-admin)/super-admin/trials/*) and
--   updateBuildingCharge() in app/actions/trials.ts keep working. Treat
--   pulse_monthly_charge as a legacy display field from here on. Do NOT
--   dual-write both on every mutation — two writable price fields will drift.
--
-- PRICING (mirrors app/pricing/page.tsx, and lib/client-pricing.ts):
--   Starter  <= 100 flats  -> FLAT PKR 15,000 / month (NOT per flat)
--   Growth   101-400 flats -> PKR 100 / flat / month
--   Pro      401+  flats   -> PKR  50 / flat / month
--   Annual billing         -> 20% off the monthly rate, then x12
--   Onboarding fee         -> PKR 10,000 one-time, optional + waivable
--   The tier price is only the STANDARD/list price. Super-admin may override
--   the charged monthly amount to ANYTHING via monthly_rate (including 0 for
--   a fully-comped building). The invoice shows standard, discount and
--   amount actually charged.
--
-- DO NOT APPLY AUTOMATICALLY — a human applies this migration.
-- ============================================================================


-- ─── 1. Invoice number sequence ─────────────────────────────────────────────
-- Human-quotable, guaranteed-unique invoice numbers. HMS derived its display
-- number from the first 8 hex chars of the row uuid, which is random and
-- collision-prone; we use a real sequence instead. Format: INV-B0000001
-- (the leading "B" is for Building, and keeps the shape of the reference
-- invoice's "#INV-B9543490").
create sequence if not exists public.bms_platform_invoice_no_seq
  as bigint
  start with 1
  increment by 1
  no cycle;


-- ─── 2. bms_client_billing ──────────────────────────────────────────────────
create table if not exists public.bms_client_billing (
  id                  uuid        primary key default gen_random_uuid(),

  -- One billing config per building. UNIQUE (not just PK) so server actions
  -- can upsert with onConflict: 'building_id'.
  building_id         uuid        not null unique
                                  references public.bms_buildings(id) on delete cascade,

  -- Who we bill. Denormalised on purpose: the invoice is addressed to a
  -- named human ("BILLED TO" block on the PDF), which is not necessarily the
  -- building's admin profile, and must not change if that admin is replaced.
  contact_name        text,
  contact_email       text,
  contact_phone       text,

  billing_cycle       text        not null default 'monthly'
                                  check (billing_cycle in ('monthly', 'annual')),

  -- THE OVERRIDE LEVER.
  --   NULL  = charge the standard tier price for the building's flat count.
  --   0     = fully comped / free (a legitimate super-admin decision).
  --   > 0   = charge exactly this per month, whatever the tier says.
  -- This is the PRE-annual-discount monthly figure; the annual discount is
  -- applied on top of it at generation time.
  monthly_rate        numeric(12,2) check (monthly_rate is null or monthly_rate >= 0),

  -- Discount applied ONLY when billing_cycle = 'annual' (matches the public
  -- pricing page, where the 20% is the "billed annually" incentive). Stored
  -- per-client so a bespoke annual deal is possible.
  annual_discount_pct numeric(5,2)  not null default 20
                                  check (annual_discount_pct >= 0 and annual_discount_pct <= 100),

  -- Onboarding is one-time and only ever applies to a building's FIRST
  -- invoice. Defaulted to TRUE (waived) because the fee is explicitly
  -- optional in our pricing — charging it must be a deliberate act.
  waive_onboarding    boolean     not null default true,

  -- Period anchor for the next invoice to be generated. NULL = automatic
  -- generation is off for this building.
  next_invoice_date   date,

  pricing_notes       text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.bms_client_billing is
  'Per-building config for the Pulse platform subscription (PulseHub bills the client). Supersedes bms_buildings.pulse_monthly_charge.';
comment on column public.bms_client_billing.monthly_rate is
  'Super-admin override of the charged monthly amount, PRE annual discount. NULL = use the standard tier price for the flat count. 0 = fully comped.';
comment on column public.bms_client_billing.annual_discount_pct is
  'Discount applied only when billing_cycle = annual. Defaults to 20 to match app/pricing/page.tsx.';
comment on column public.bms_client_billing.waive_onboarding is
  'Defaults TRUE — the PKR 10,000 onboarding fee is optional and must be opted into. Only meaningful on the first invoice.';

create index if not exists bms_client_billing_building_idx
  on public.bms_client_billing (building_id);
create index if not exists bms_client_billing_next_invoice_idx
  on public.bms_client_billing (next_invoice_date)
  where next_invoice_date is not null;


-- ─── 3. bms_platform_invoices ───────────────────────────────────────────────
create table if not exists public.bms_platform_invoices (
  id                    uuid        primary key default gen_random_uuid(),

  invoice_no            text        not null unique
                                    default ('INV-B' || lpad(
                                      nextval('public.bms_platform_invoice_no_seq')::text, 7, '0')),

  building_id           uuid        not null
                                    references public.bms_buildings(id) on delete cascade,

  -- ── Period ──
  billing_period_start  date        not null,
  billing_period_end    date        not null,
  -- Human label rendered on the PDF meta box, e.g. "Aug 2026" or "2026".
  -- Snapshotted so relabelling logic later cannot rewrite history.
  period_label          text        not null,
  billing_cycle         text        not null
                                    check (billing_cycle in ('monthly', 'annual')),

  -- ── Pricing snapshot (frozen at generation; the PDF reads ONLY these) ──
  -- Flat count at generation time. Drives the "(N Flats)" line-item label
  -- and the tier that produced standard_monthly_rate.
  flats_count           integer     not null check (flats_count >= 0),
  -- Standard/list price per month for that flat count (the tier price).
  standard_monthly_rate numeric(12,2) not null check (standard_monthly_rate >= 0),
  -- Charged price per month, PRE annual discount (i.e. the override, or the
  -- standard rate when there is no override).
  monthly_rate          numeric(12,2) not null check (monthly_rate >= 0),
  -- EFFECTIVE total discount vs. standard for this period, for DISPLAY only:
  -- (standard_amount - subscription_amount) / standard_amount * 100.
  -- Never invert a price out of this — standard_amount is stored explicitly
  -- precisely so a 100% discount cannot produce a division by zero.
  discount_pct          numeric(5,2)  not null default 0
                                    check (discount_pct >= 0 and discount_pct <= 100),
  -- Standard list price for the whole period (standard_monthly_rate x 1 or x12).
  standard_amount       numeric(12,2) not null check (standard_amount >= 0),
  -- Actually-charged subscription for the whole period, post override and
  -- post annual discount. Excludes onboarding.
  subscription_amount   numeric(12,2) not null check (subscription_amount >= 0),
  -- 0 when waived or when this is not the first invoice.
  onboarding_fee_charged numeric(12,2) not null default 0
                                    check (onboarding_fee_charged >= 0),
  is_first_invoice      boolean     not null default false,

  -- Grand total = subscription_amount + onboarding_fee_charged.
  -- Rendered verbatim as "AMOUNT CHARGED"; never recomputed at render time.
  amount                numeric(12,2) not null check (amount >= 0),

  -- ── Lifecycle ──
  status                text        not null default 'unpaid'
                                    check (status in ('unpaid', 'paid', 'cancelled')),
  issue_date            date        not null default current_date,
  -- Net 7 from the ISSUE date (deliberately not from billing_period_start —
  -- a future-period invoice must not look due on the day it is raised).
  due_date              date        not null,
  paid_at               timestamptz,
  marked_paid_by        uuid        references auth.users(id) on delete set null,

  -- Unguessable credential for the public PDF link at /invoice/[token].
  -- Generated by Postgres, never by app code. 122 bits of entropy.
  share_token           uuid        not null default gen_random_uuid(),

  notes                 text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint bms_platform_invoices_period_order
    check (billing_period_end > billing_period_start)
);

comment on table public.bms_platform_invoices is
  'Invoices PulseHub raises against a client building for its Pulse BMS subscription. Every row is an immutable pricing snapshot — the PDF renders from these columns only.';
comment on column public.bms_platform_invoices.invoice_no is
  'Sequence-backed human invoice number, e.g. INV-B0000042. Unique.';
comment on column public.bms_platform_invoices.share_token is
  'Credential for the unauthenticated PDF route /invoice/[token]. Never log it and never expose it to anyone but super_admin and the client.';
comment on column public.bms_platform_invoices.discount_pct is
  'DISPLAY ONLY. Derived at generation time from standard_amount vs subscription_amount. Never used to reconstruct a price.';

-- Idempotency: one invoice per building per period. HMS enforced this only in
-- application code, so a cron run racing a manual "Generate now" click could
-- double-insert (and then break .maybeSingle()). Enforce it in the DB.
create unique index if not exists bms_platform_invoices_building_period_uniq
  on public.bms_platform_invoices (building_id, billing_period_start);

create index if not exists bms_platform_invoices_building_idx
  on public.bms_platform_invoices (building_id, billing_period_start desc);
create index if not exists bms_platform_invoices_status_idx
  on public.bms_platform_invoices (status, due_date);
create unique index if not exists bms_platform_invoices_share_token_uniq
  on public.bms_platform_invoices (share_token);


-- ─── 4. updated_at triggers ─────────────────────────────────────────────────
create or replace function public.bms_client_billing_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bms_client_billing_updated_at_trg on public.bms_client_billing;
create trigger bms_client_billing_updated_at_trg
  before update on public.bms_client_billing
  for each row execute function public.bms_client_billing_set_updated_at();

drop trigger if exists bms_platform_invoices_updated_at_trg on public.bms_platform_invoices;
create trigger bms_platform_invoices_updated_at_trg
  before update on public.bms_platform_invoices
  for each row execute function public.bms_client_billing_set_updated_at();


-- ─── 5. Backfill from the superseded pulse_monthly_charge ───────────────────
-- Seed a billing config for every building that already has a charge set, so
-- the new screen is not empty on day one. Existing rows are left alone.
-- pulse_monthly_charge itself is intentionally NOT dropped or nulled.
insert into public.bms_client_billing (building_id, monthly_rate, billing_cycle)
select b.id, b.pulse_monthly_charge, 'monthly'
from public.bms_buildings b
where b.pulse_monthly_charge is not null
on conflict (building_id) do nothing;


-- ─── 6. RLS — super_admin ONLY ──────────────────────────────────────────────
-- Platform billing is vendor-internal commercial data. Building admins, union
-- members and residents must never see what Pulse charges, and the 'sales'
-- role must not see or edit invoices either (it can already reach
-- /super-admin/trials, so a broader policy would leak).
--
-- The role check is inlined against bms_profiles rather than routed through a
-- helper function, matching the established pattern in this repo (see
-- 20260523040000_bms_leads.sql and 20260613000001_bms_website_inquiries.sql).
--
-- All writes in the app go through service-role server actions, which bypass
-- RLS entirely; these policies exist so a session-scoped read from the
-- super-admin UI works and so nothing else can read the tables.
alter table public.bms_client_billing    enable row level security;
alter table public.bms_platform_invoices enable row level security;

drop policy if exists bms_client_billing_super_admin_all on public.bms_client_billing;
create policy bms_client_billing_super_admin_all on public.bms_client_billing
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

drop policy if exists bms_platform_invoices_super_admin_all on public.bms_platform_invoices;
create policy bms_platform_invoices_super_admin_all on public.bms_platform_invoices
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

-- Demo super-admins must not be able to raise real invoices. RESTRICTIVE
-- policies stack on top of the permissive one above, mirroring
-- 20260520120000_bms_demo_mode.sql. SELECT stays open so demo accounts browse.
drop policy if exists bms_client_billing_demo_deny_ins on public.bms_client_billing;
create policy bms_client_billing_demo_deny_ins on public.bms_client_billing
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_client_billing_demo_deny_upd on public.bms_client_billing;
create policy bms_client_billing_demo_deny_upd on public.bms_client_billing
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user());
drop policy if exists bms_client_billing_demo_deny_del on public.bms_client_billing;
create policy bms_client_billing_demo_deny_del on public.bms_client_billing
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());

drop policy if exists bms_platform_invoices_demo_deny_ins on public.bms_platform_invoices;
create policy bms_platform_invoices_demo_deny_ins on public.bms_platform_invoices
  as restrictive for insert to authenticated
  with check (not public.bms_is_demo_user());
drop policy if exists bms_platform_invoices_demo_deny_upd on public.bms_platform_invoices;
create policy bms_platform_invoices_demo_deny_upd on public.bms_platform_invoices
  as restrictive for update to authenticated
  using (not public.bms_is_demo_user());
drop policy if exists bms_platform_invoices_demo_deny_del on public.bms_platform_invoices;
create policy bms_platform_invoices_demo_deny_del on public.bms_platform_invoices
  as restrictive for delete to authenticated
  using (not public.bms_is_demo_user());
