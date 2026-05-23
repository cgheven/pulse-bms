-- ============================================================================
-- bms_payments.receipt_no — per-building monotonic integer receipt number.
-- ----------------------------------------------------------------------------
-- The old `receipt_no` was an opaque TEXT string (e.g. "RCPT-DEMO-PROJ-018").
-- Karachi paper receipt books use 6-digit monotonic sequences per society —
-- `000001`, `000002`, … — so digitised receipts can replace the paper book
-- one-for-one. We preserve the legacy text value as `legacy_receipt_no` for
-- audit history / backfill traceability and introduce a fresh INTEGER
-- `receipt_no` that the trigger allocates per-building.
-- ============================================================================

-- 1. Rename the legacy text column. Existing reads of `receipt_no` across the
--    codebase will be migrated to read the integer column post-deploy.
alter table public.bms_payments
  rename column receipt_no to legacy_receipt_no;

-- 2. Add the new integer column. Nullable so we can backfill below before
--    flipping to monotonic-on-insert via trigger.
alter table public.bms_payments
  add column if not exists receipt_no integer;

-- 3. Unique per (building_id, receipt_no). Nullable rows excluded via partial
--    index so the backfill can run safely without conflict.
create unique index if not exists bms_payments_receipt_no_per_building_idx
  on public.bms_payments (building_id, receipt_no)
  where receipt_no is not null;

-- 4. BEFORE INSERT trigger — allocate per-building monotonic receipt_no.
--    Race-safe via row lock on bms_buildings: concurrent inserts for the
--    same tenant serialise on the building row, so two parallel inserts
--    can never both compute MAX()+1 = N. Cross-building inserts proceed
--    in parallel because they lock different building rows.
create or replace function public.bms_payments_assign_receipt_no()
returns trigger language plpgsql as $$
begin
  if new.receipt_no is null then
    -- Lock the tenant row to serialise concurrent inserts.
    perform 1 from public.bms_buildings where id = new.building_id for update;
    select coalesce(max(receipt_no), 0) + 1
      into new.receipt_no
      from public.bms_payments
      where building_id = new.building_id;
  end if;
  return new;
end;
$$;

drop trigger if exists bms_payments_receipt_no_trg on public.bms_payments;
create trigger bms_payments_receipt_no_trg
  before insert on public.bms_payments
  for each row execute function public.bms_payments_assign_receipt_no();

-- 5. Backfill existing rows. Per-building monotonic by payment_date asc,
--    then created_at asc, then id asc to break ties deterministically.
with ordered as (
  select id, building_id,
    row_number() over (
      partition by building_id
      order by payment_date asc, created_at asc, id asc
    ) as rn
  from public.bms_payments
  where receipt_no is null
)
update public.bms_payments p
   set receipt_no = ordered.rn
  from ordered
 where p.id = ordered.id;
