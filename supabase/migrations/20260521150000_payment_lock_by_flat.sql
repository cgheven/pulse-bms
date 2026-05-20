-- bms_record_payment_with_lock — re-keyed to flat_id
--
-- Previous version (20260521120000_payment_advisory_lock.sql) locked on the
-- invoice id. That misses a real-world race: a chowkidar batch-recording five
-- cash payments at end of day for flat A-101 across March + April invoices
-- both read bms_flats.outstanding_dues, both subtract, both write — last-
-- writer-wins, dues drift by one chunk amount per collision.
--
-- New granularity: per-flat. All concurrent payments touching the same flat
-- (regardless of which invoice) queue behind one advisory lock. For a
-- ~30-flat building with ≤5 concurrent ops max, contention is negligible.
--
-- Function gains a third argument p_flat_id. We still verify the invoice
-- belongs to the caller's building (defense in depth — RLS also covers this).
-- p_invoice_id may be skipped for non-maintenance payments (entry_fee / other),
-- but callers in this codebase only invoke the lock when invoice_id is set.
--
-- create or replace is used so the function updates in place; the older
-- two-arg signature is dropped explicitly to prevent ambiguity from
-- PostgREST's function overload resolution.
drop function if exists public.bms_record_payment_with_lock(uuid, uuid);

create or replace function public.bms_record_payment_with_lock(
  p_invoice_id uuid,
  p_building_id uuid,
  p_flat_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building uuid;
begin
  -- Verify the invoice exists and belongs to the given building.
  select building_id into v_building
    from public.bms_invoices
   where id = p_invoice_id;

  if v_building is null then
    raise exception 'invoice % not found', p_invoice_id;
  end if;

  if v_building <> p_building_id then
    raise exception 'invoice % does not belong to building %', p_invoice_id, p_building_id;
  end if;

  -- Acquire xact-scoped advisory lock keyed on the flat id. Auto-released
  -- when the surrounding statement-batch transaction ends. Locking per-flat
  -- (not per-invoice) ensures that two payments against DIFFERENT invoices
  -- on the SAME flat still serialise — they both mutate bms_flats.outstanding_dues.
  perform pg_advisory_xact_lock(hashtextextended(p_flat_id::text, 0));
end;
$$;

revoke all on function public.bms_record_payment_with_lock(uuid, uuid, uuid) from public;
grant execute on function public.bms_record_payment_with_lock(uuid, uuid, uuid) to authenticated;

comment on function public.bms_record_payment_with_lock(uuid, uuid, uuid) is
  'Advisory-locks a flat for the duration of the current transaction so concurrent recordPayment calls on the same flat (even across different invoices) cannot race the cap-and-spill or outstanding_dues bookkeeping.';
