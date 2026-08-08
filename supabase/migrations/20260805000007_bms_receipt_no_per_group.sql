-- One collection, one receipt number.
--
-- Receipt numbers follow the paper-book convention: a per-building monotonic
-- integer the committee can cross-reference against a physical register. When
-- a resident pays six months at once, the allocation splits into six rows —
-- and until now the trigger stamped a fresh number on every one of them. The
-- register would show numbers 431-440 issued for a single handover, nine of
-- which no resident ever receives. The sequence looks tampered with.
--
-- New rule: only the ANCHOR of a payment group is a receipt. The anchor is
-- the row whose id equals its payment_group_id; the other rows are
-- allocations of that same receipt and carry receipt_no NULL. This is
-- already safe at the storage layer — bms_payments_receipt_no_per_building_idx
-- is `unique (building_id, receipt_no) where receipt_no is not null`.
--
-- The column default is dropped in the same breath. It has to be: with
-- `default gen_random_uuid()` an ordinary single-row insert would arrive with
-- a group id that is NOT its own id, the trigger would read it as a
-- non-anchor, and the row would silently lose its receipt number. Defaulting
-- inside the trigger instead means any caller that does not care about groups
-- — billing.ts burning a credit, a manual insert, a future feature — still
-- gets an anchor row with a receipt, exactly as before.

alter table public.bms_payments
  alter column payment_group_id drop default;

create or replace function public.bms_payments_assign_receipt_no()
returns trigger
language plpgsql
as $function$
declare
  attempt int := 0;
begin
  -- A row that does not declare a group is its own group, and therefore an
  -- anchor. Must run before the anchor test below.
  if new.payment_group_id is null then
    new.payment_group_id := new.id;
  end if;

  -- Caller supplied a number explicitly — respect it (used by imports and
  -- by the retry path below).
  if new.receipt_no is not null then
    return new;
  end if;

  -- Non-anchor rows are allocations of a receipt that already exists, not
  -- receipts of their own. Leave receipt_no NULL.
  if new.payment_group_id <> new.id then
    return new;
  end if;

  -- Transaction-scoped advisory lock keyed on building_id. Released on
  -- COMMIT / ROLLBACK. Doesn't depend on a real table row being held;
  -- doesn't conflict with REPEATABLE READ snapshots. Two parallel
  -- inserts to different buildings won't block each other (different
  -- hash keys); two to the same building serialize cleanly.
  perform pg_advisory_xact_lock(hashtextextended(new.building_id::text, 0));

  -- Retry loop in case the unique partial index throws — defensive
  -- against any future code path that bypasses the trigger (eg admin
  -- writing receipt_no manually) and races with a normal insert.
  <<allocate>>
  loop
    attempt := attempt + 1;
    begin
      select coalesce(max(receipt_no), 0) + 1
        into new.receipt_no
        from public.bms_payments
        where building_id = new.building_id;
      return new;
    exception when unique_violation then
      if attempt >= 5 then raise; end if;
      -- Loop back and pick the next available number.
      continue;
    end;
  end loop;
end;
$function$;

comment on function public.bms_payments_assign_receipt_no is
  'BEFORE INSERT on bms_payments: defaults payment_group_id to the row''s own id, then allocates a per-building monotonic receipt_no to group ANCHORS only (payment_group_id = id). Non-anchor allocation rows keep receipt_no NULL — one physical collection issues exactly one receipt number.';
