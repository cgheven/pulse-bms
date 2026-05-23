-- ============================================================================
-- bms_payments.receipt_no — race-safer trigger via advisory lock + retry.
-- ----------------------------------------------------------------------------
-- The previous trigger (20260523020000_bms_payments_receipt_no.sql) serialised
-- concurrent inserts by row-locking the corresponding `bms_buildings` row
-- (`SELECT 1 FROM bms_buildings WHERE id = new.building_id FOR UPDATE`).
-- That works, but couples receipt allocation to a real-table row lock —
-- conflicts with REPEATABLE READ snapshots taken by parallel admin reads,
-- and deadlocks if anything else in the same txn happens to touch
-- bms_buildings concurrently.
--
-- Replace with a transaction-scoped advisory lock keyed on a deterministic
-- hash of `building_id`:
--   * `pg_advisory_xact_lock(bigint)` — released automatically on COMMIT or
--     ROLLBACK so we cannot leak locks.
--   * `hashtextextended(text, bigint)` returns `bigint` — exactly what the
--     advisory lock function wants.
--   * Different buildings hash to different keys → cross-tenant inserts
--     run in parallel.
--   * Same-building parallel inserts serialise cleanly on the hash key.
--
-- The body also gains a defensive retry on `unique_violation`. The trigger
-- itself can't trip the unique partial index (the advisory lock ensures
-- mutual exclusion), but any future code path that bypasses the trigger
-- (e.g. an admin writing `receipt_no` manually and racing a normal insert)
-- would otherwise crash. We retry up to 5 times — each iteration recomputes
-- `max(receipt_no)+1` so it picks up whatever was just committed.
-- ============================================================================

create or replace function public.bms_payments_assign_receipt_no()
returns trigger language plpgsql as $$
declare
  attempt int := 0;
begin
  if new.receipt_no is not null then
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
$$;
