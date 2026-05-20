-- bms_record_payment_with_lock
--
-- Serialises concurrent payment recording against the SAME invoice so the
-- "cap-and-spill" logic in app/actions/payments.ts can't race with itself.
--
-- Two payments hitting the same invoice at the same wall-clock would both
-- read the same paidTotal, both decide there's no overflow, and both write
-- the full amount — leaving the invoice over-paid with no credit row.
--
-- Pattern: pg_advisory_xact_lock keyed on the invoice id. The lock is held
-- until the surrounding (implicit) transaction in PostgREST commits, which
-- covers every subsequent SELECT / INSERT / UPDATE in the same request.
-- p_building_id is a defence-in-depth check — refuse to lock if the invoice
-- doesn't belong to the caller's building.

create or replace function public.bms_record_payment_with_lock(
  p_invoice_id uuid,
  p_building_id uuid
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

  -- Acquire xact-scoped advisory lock keyed on the invoice id. Auto-released
  -- when the surrounding statement-batch transaction ends.
  perform pg_advisory_xact_lock(hashtextextended(p_invoice_id::text, 0));
end;
$$;

revoke all on function public.bms_record_payment_with_lock(uuid, uuid) from public;
grant execute on function public.bms_record_payment_with_lock(uuid, uuid) to authenticated;

comment on function public.bms_record_payment_with_lock(uuid, uuid) is
  'Advisory-locks an invoice for the duration of the current transaction so concurrent recordPayment calls cannot race the cap-and-spill logic.';
