-- bms_delete_payment_group — reverse one physical collection, atomically.
--
-- The old deletePayment removed a single row. For anything but a plain
-- single-invoice payment that was destructive: recording a Rs. 30,000 advance
-- reduced outstanding_dues by Rs. 30,000 but capped the visible row at
-- Rs. 5,000, so deleting it credited back Rs. 5,000 and left the flat
-- Rs. 25,000 short — plus orphaned spillover rows and an orphaned credit
-- (bms_flat_credits.source_payment_id is ON DELETE SET NULL, so the link that
-- would have let anyone find it was erased too).
--
-- A collection is one unit. Deleting any row of it reverses all of it: the
-- payment rows, the invoices that collection created up front, and the credit
-- it left on account.
--
-- REVERSING A SPENT ADVANCE (E42). If a later month has already consumed part
-- of the advance, that month reverts to unpaid and is reported back in
-- `reopened_invoices`. An earlier draft refused instead, telling the operator
-- to "reverse that invoice first" — an instruction nothing in the system can
-- carry out, which made a mistyped payment permanently unfixable as soon as
-- the next month was generated.
--
-- SECURITY DEFINER for the same reason as bms_record_payment_allocated: the
-- reversal deletes invoices, and the roles allowed to delete payments do not
-- all hold invoice DELETE under RLS. Every RLS check is re-implemented below.
-- Deletion is restricted to admin / super_admin, matching the previous
-- requireRole(["admin","super_admin"]) on the server action.

create or replace function public.bms_delete_payment_group(
  p_building_id uuid,
  p_payment_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid              uuid := auth.uid();
  v_role             text;
  v_is_demo          boolean;
  v_can_write        boolean := false;

  v_group            uuid;
  v_flat_id          uuid;
  v_deleted_rows     integer := 0;
  v_total            numeric(12,2) := 0;
  v_entry_fee        numeric(12,2) := 0;
  v_resident_id      uuid;
  v_consumed         integer := 0;
  v_touched          uuid[] := '{}';
  v_deleted_invoices uuid[] := '{}';
  v_reopened         uuid[] := '{}';
  v_id               uuid;
  v_paid_total       numeric(12,2);
  v_inv_amount       numeric(12,2);
begin
  -- ══ 1. Authentication ════════════════════════════════════════════════
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select p.role, coalesce(p.is_demo, false)
    into v_role, v_is_demo
    from public.bms_profiles p
   where p.id = v_uid;

  if v_role is null then
    raise exception 'No profile for the current user' using errcode = '28000';
  end if;

  if v_is_demo then
    raise exception 'Demo accounts cannot delete payments' using errcode = '42501';
  end if;

  -- ══ 2. Authorisation ═════════════════════════════════════════════════
  -- Deleting money is admin-only; union officers record but do not reverse.
  if v_role = 'super_admin' then
    v_can_write := true;
  elsif v_role = 'admin' then
    v_can_write := public.bms_can_write_building(p_building_id);
  else
    v_can_write := false;
  end if;

  if not v_can_write then
    raise exception 'Not allowed to delete payments for this building'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.bms_buildings b
     where b.id = p_building_id
       and b.is_trial = true
       and b.trial_ends_at < now()
  ) then
    raise exception 'This building''s trial has ended' using errcode = '42501';
  end if;

  -- ══ 3. Resolve the group from ANY row in it ══════════════════════════
  -- Deleting a child row reverses the whole collection, not just that row
  -- (E40) — a child is an allocation, not an independent payment.
  select pp.payment_group_id, pp.flat_id
    into v_group, v_flat_id
    from public.bms_payments pp
   where pp.id = p_payment_id
     and pp.building_id = p_building_id;

  if v_group is null then
    -- Already gone. Idempotent by design (E44).
    return jsonb_build_object(
      'group_id', null, 'deleted_rows', 0, 'total', 0,
      'deleted_invoices', '[]'::jsonb, 'already_deleted', true
    );
  end if;

  -- ══ 4. Serialise against recorders on the same flat ══════════════════
  if v_flat_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_flat_id::text, 0));
  end if;

  -- ══ 5. Months a consumed advance had settled ═════════════════════════
  --
  -- This used to refuse outright when a later invoice had already eaten into
  -- the advance, telling the operator to "reverse that invoice first". There
  -- is no such operation — nothing in the system ever sets
  -- applied_invoice_id back to NULL — so a mistyped payment became permanently
  -- unfixable the moment the next month was generated.
  --
  -- The refusal was also unnecessary. Consuming an advance never moves money
  -- out of the collection: bms_apply_flat_credits re-attaches the advance row,
  -- or splits it into a sibling carrying the SAME payment_group_id. Both stay
  -- inside this group, so the delete below removes them, and the later
  -- invoice they were paying for simply reverts to unpaid in step 9 — which
  -- is the honest outcome, because the money funding it has been reversed.
  --
  -- We record which months that affects so the caller can say so plainly.
  select coalesce(array_agg(distinct c.applied_invoice_id), '{}')
    into v_reopened
    from public.bms_flat_credits c
   where c.building_id = p_building_id
     and c.applied_invoice_id is not null
     and c.source_payment_id in (
       select pp.id from public.bms_payments pp
        where pp.payment_group_id = v_group
          and pp.building_id = p_building_id
     );

  v_consumed := coalesce(array_length(v_reopened, 1), 0);

  -- ══ 6. Capture what we are about to remove ═══════════════════════════
  select count(*), coalesce(sum(pp.amount), 0),
         coalesce(sum(pp.amount) filter (where pp.category = 'entry_fee'), 0)
    into v_deleted_rows, v_total, v_entry_fee
    from public.bms_payments pp
   where pp.payment_group_id = v_group
     and pp.building_id = p_building_id;

  -- Entry-fee collections are always a single row (the allocation waterfall
  -- returns early for every non-maintenance category), so this is exact.
  select pp.resident_id into v_resident_id
    from public.bms_payments pp
   where pp.payment_group_id = v_group
     and pp.building_id = p_building_id
     and pp.category = 'entry_fee'
   limit 1;

  select coalesce(array_agg(distinct pp.invoice_id), '{}')
    into v_touched
    from public.bms_payments pp
   where pp.payment_group_id = v_group
     and pp.building_id = p_building_id
     and pp.invoice_id is not null;

  -- ══ 7. Credits first ═════════════════════════════════════════════════
  -- Must precede the payment delete: source_payment_id is ON DELETE SET
  -- NULL, so removing the payments first would erase the only link back and
  -- strand the credit permanently. This deliberately takes CLOSED credits
  -- too — a credit already applied to a later month is backed by a row in
  -- this group, and that row is about to disappear.
  delete from public.bms_flat_credits c
   where c.building_id = p_building_id
     and c.source_payment_id in (
       select pp.id from public.bms_payments pp
        where pp.payment_group_id = v_group
          and pp.building_id = p_building_id
     );

  -- ══ 8. The payment rows ══════════════════════════════════════════════
  delete from public.bms_payments pp
   where pp.payment_group_id = v_group
     and pp.building_id = p_building_id;

  -- ══ 9. Invoices this collection created up front ═════════════════════
  -- Only ones with no payments left. If a later collection also paid into a
  -- month we created, that month stays and simply reverts to unpaid (E41).
  with removable as (
    select i.id
      from public.bms_invoices i
     where i.building_id = p_building_id
       and i.created_by_payment_group = v_group
       and not exists (
         select 1 from public.bms_payments pp
          where pp.invoice_id = i.id
            and pp.building_id = p_building_id
       )
  ), del as (
    delete from public.bms_invoices i
     using removable r
     where i.id = r.id
    returning i.id
  )
  select coalesce(array_agg(del.id), '{}') into v_deleted_invoices from del;

  -- Restate whichever touched invoices survived, plus any month that was
  -- being funded by this collection's advance.
  foreach v_id in array (v_touched || v_reopened) loop
    select i.amount into v_inv_amount
      from public.bms_invoices i
     where i.id = v_id and i.building_id = p_building_id;

    -- Deleted in step 9; nothing to restate.
    continue when v_inv_amount is null;

    select coalesce(sum(pp.amount), 0) into v_paid_total
      from public.bms_payments pp
     where pp.invoice_id = v_id and pp.building_id = p_building_id;

    update public.bms_invoices
       set status = case
             when v_paid_total >= v_inv_amount and v_inv_amount > 0 then 'paid'
             when v_paid_total > 0 then 'partial'
             else 'pending'
           end
     where id = v_id
       and building_id = p_building_id
       and status <> 'waived';
  end loop;

  -- ══ 10. Entry-fee running total ══════════════════════════════════════
  if v_entry_fee > 0 and v_resident_id is not null then
    update public.bms_residents
       set entry_fee_paid = greatest(0, coalesce(entry_fee_paid, 0) - v_entry_fee)
     where id = v_resident_id
       and building_id = p_building_id;
  end if;

  -- ══ 11. Rebuild dues from the surviving invoices ═════════════════════
  if v_flat_id is not null then
    perform public.bms_recalc_flat_dues_unchecked(p_building_id, v_flat_id);
  end if;

  return jsonb_build_object(
    'group_id',         v_group,
    'flat_id',          v_flat_id,
    'deleted_rows',     v_deleted_rows,
    'total',            v_total,
    'deleted_invoices', to_jsonb(v_deleted_invoices),
    'reopened_invoices', to_jsonb(v_reopened),
    'already_deleted',  false
  );
end;
$function$;

comment on function public.bms_delete_payment_group is
  'Reverse an entire collection atomically from any row in it: its payment rows, the invoices it created up front (only those left with no payments), and the credit it held on account. Refuses when a later invoice has already consumed that credit. Rebuilds outstanding_dues from source. admin / super_admin only.';

revoke all on function public.bms_delete_payment_group(uuid, uuid) from public;
revoke all on function public.bms_delete_payment_group(uuid, uuid) from anon;
grant execute on function public.bms_delete_payment_group(uuid, uuid) to authenticated;
