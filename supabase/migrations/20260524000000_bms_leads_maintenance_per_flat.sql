-- BMS leads: per-flat monthly maintenance fee.
--
-- Lets the sales rep capture the society's per-flat maintenance and
-- derive total monthly collection (flats × this) + Pulse fee as % of
-- collection. Optional — set whenever the rep learns the number.
alter table public.bms_leads
  add column if not exists maintenance_per_flat numeric(10,2);

comment on column public.bms_leads.maintenance_per_flat is
  'Monthly maintenance fee per flat (PKR). Used to compute the lead''s total monthly collection and Pulse fee as % of collection.';
