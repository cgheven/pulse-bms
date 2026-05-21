-- Building-level opening balance.
-- One-time onboarding number — total cash + bank money the society had
-- when they started using Pulse. Cash Book + Day Book "All combined"
-- views fold this into base opening so the running balance reflects
-- pre-Pulse reality without forcing admins to backfill years of
-- historical transactions.
alter table public.bms_buildings
  add column if not exists opening_balance_amount numeric(14,2) not null default 0,
  add column if not exists opening_balance_date   date          not null default current_date;

comment on column public.bms_buildings.opening_balance_amount is
  'Total cash + bank balance the society had when onboarding to Pulse. Set once via /admin/settings/opening-balance.';
comment on column public.bms_buildings.opening_balance_date is
  'As-of date for opening_balance_amount. Cash Book / Day Book treat money before this date as the building opening seed.';
