-- bms_apply_flat_credits — consume advance held on account, without
-- inventing money.
--
-- THE DOUBLE-COUNT THIS AVOIDS
--
-- When a resident pays more than the months available to bill, the remainder
-- is written as a real payment row with no invoice (see step 12 of
-- bms_record_payment_allocated) so the cash is counted on the day it actually
-- arrived, against the account it actually landed in.
--
-- The old code then burned that credit by INSERTING a second payment row with
-- payment_mode = 'credit_carryforward'. Under the new model that row would be
-- money appearing twice: once when the resident handed it over, once when a
-- later invoice consumed it. Every report that sums bms_payments — the cash
-- position, the day book, the collection reports, the monthly report — would
-- have over-stated income, and the only fix would be to teach all of them to
-- filter out one payment mode.
--
-- So nothing new is inserted. The advance row that already holds the money is
-- simply attached to the invoice it now pays for, splitting it when the
-- invoice is smaller than the advance. The rupees never move, they just stop
-- being unallocated. `credit_carryforward` is left in the CHECK constraint for
-- the sake of any historical row, but this system no longer writes it.
--
-- SECURITY DEFINER, admin / super_admin only — it is called from monthly
-- invoice generation, which is already requireRole(["admin","super_admin"]).
-- Every RLS check is re-implemented, as in the sibling payment functions.

create or replace function public.bms_apply_flat_credits(
  p_building_id uuid,
  p_flat_id     uuid,
  p_invoice_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid          uuid := auth.uid();
  v_role         text;
  v_is_demo      boolean;
  v_can_write    boolean := false;

  v_inv_amount   numeric(12,2);
  v_paid_total   numeric(12,2);
  v_capacity     numeric(12,2);
  v_apply        numeric(12,2);
  v_applied      numeric(12,2) := 0;
  v_count        integer := 0;

  v_credit       record;
  v_src_amount   numeric(12,2);
  v_new_row      uuid;
begin
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
    raise exception 'Demo accounts cannot generate invoices' using errcode = '42501';
  end if;

  if v_role = 'super_admin' then
    v_can_write := true;
  elsif v_role = 'admin' then
    v_can_write := public.bms_can_write_building(p_building_id);
  end if;

  if not v_can_write then
    raise exception 'Not allowed to apply credits for this building'
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

  -- Tenancy: the invoice must be this flat's, in this building.
  select i.amount into v_inv_amount
    from public.bms_invoices i
   where i.id = p_invoice_id
     and i.building_id = p_building_id
     and i.flat_id = p_flat_id
     and coalesce(i.status, '') <> 'waived';

  if v_inv_amount is null then
    return jsonb_build_object('applied', 0, 'count', 0);
  end if;

  -- Same lock the recorder takes, so a credit cannot be consumed while a
  -- payment is being allocated against the same flat.
  perform pg_advisory_xact_lock(hashtextextended(p_flat_id::text, 0));

  for v_credit in
    select c.id, c.amount, c.source_payment_id, c.created_at
      from public.bms_flat_credits c
     where c.building_id = p_building_id
       and c.flat_id = p_flat_id
       and c.applied_invoice_id is null
     order by c.created_at asc, c.id asc
  loop
    select coalesce(sum(pp.amount), 0) into v_paid_total
      from public.bms_payments pp
     where pp.invoice_id = p_invoice_id
       and pp.building_id = p_building_id;

    v_capacity := v_inv_amount - v_paid_total;
    exit when v_capacity <= 0;

    -- A credit whose advance row has gone (legacy data, or a payment removed
    -- outside the group reversal) has no money behind it to re-attach. Leave
    -- it alone rather than conjuring a payment row for it.
    continue when v_credit.source_payment_id is null;

    -- flat_id is part of the guard, not just building_id: without it a credit
    -- row planted against flat A but pointing at flat B's unallocated payment
    -- would re-attach B's money to A's invoice, leaving the payment row
    -- carrying flat B while settling flat A. Same-building and admin-only, so
    -- not an escalation — but the money would be attributed to the wrong home.
    select pp.amount into v_src_amount
      from public.bms_payments pp
     where pp.id = v_credit.source_payment_id
       and pp.building_id = p_building_id
       and pp.flat_id = p_flat_id
       and pp.invoice_id is null;

    continue when v_src_amount is null;

    v_apply := least(v_credit.amount, v_capacity, v_src_amount);
    continue when v_apply <= 0;

    if v_apply = v_src_amount then
      -- The whole advance row pays into this invoice: just attach it. No new
      -- row, no new receipt number, no change to the cash position.
      -- Append rather than overwrite: whatever the recorder wrote when they
      -- took the cash ("paid by son", a cheque detail) is the only record of
      -- it and must survive the money being allocated.
      update public.bms_payments
         set invoice_id = p_invoice_id,
             notes = case
               when nullif(btrim(coalesce(notes, '')), '') is null
                 then 'Advance applied to this month'
               when notes like '%Advance held on account'
                 then regexp_replace(notes, '( — )?Advance held on account$', '')
                      || ' — Advance applied to this month'
               else notes || ' — Advance applied to this month'
             end
       where id = v_credit.source_payment_id
         and building_id = p_building_id;

      v_new_row := v_credit.source_payment_id;
    else
      -- Only part of the advance is needed. Shrink the held row and split
      -- the used portion off as a sibling in the SAME group, carrying the
      -- original date, mode and bank account so the cash stays where it was
      -- banked. Non-anchor, so it takes no receipt number.
      update public.bms_payments
         set amount = amount - v_apply
       where id = v_credit.source_payment_id
         and building_id = p_building_id;

      insert into public.bms_payments (
        payment_group_id, building_id, invoice_id, flat_id, resident_id,
        amount, payment_date, payment_mode, reference_no, category, notes,
        recorded_by, received_by_profile_id, received_by_name,
        received_by_position, bank_account_id
      )
      select src.payment_group_id, src.building_id, p_invoice_id, src.flat_id,
             src.resident_id, v_apply, src.payment_date, src.payment_mode,
             src.reference_no, 'maintenance',
             case
               when nullif(btrim(coalesce(src.notes, '')), '') is null
                 then 'Advance applied to this month'
               when src.notes like '%Advance held on account'
                 then regexp_replace(src.notes, '( — )?Advance held on account$', '')
                      || ' — Advance applied to this month'
               else src.notes || ' — Advance applied to this month'
             end,
             src.recorded_by, src.received_by_profile_id, src.received_by_name,
             src.received_by_position, src.bank_account_id
        from public.bms_payments src
       where src.id = v_credit.source_payment_id
      returning id into v_new_row;
    end if;

    -- Close the credit against this invoice, recording the portion used and
    -- pointing at the row that now carries it. Any remainder becomes a fresh
    -- open credit against the shrunken advance row, inheriting created_at so
    -- FIFO order stays stable.
    update public.bms_flat_credits
       set applied_invoice_id = p_invoice_id,
           amount             = v_apply,
           source_payment_id  = v_new_row
     where id = v_credit.id
       and building_id = p_building_id;

    if v_credit.amount > v_apply then
      insert into public.bms_flat_credits (
        building_id, flat_id, amount, source_payment_id, notes,
        created_by, created_at
      ) values (
        p_building_id, p_flat_id, v_credit.amount - v_apply,
        v_credit.source_payment_id, 'Advance held on account',
        v_uid, v_credit.created_at
      );
    end if;

    v_applied := v_applied + v_apply;
    v_count   := v_count + 1;
  end loop;

  if v_count > 0 then
    select coalesce(sum(pp.amount), 0) into v_paid_total
      from public.bms_payments pp
     where pp.invoice_id = p_invoice_id
       and pp.building_id = p_building_id;

    update public.bms_invoices
       set status = case
             when v_paid_total >= v_inv_amount and v_inv_amount > 0 then 'paid'
             when v_paid_total > 0 then 'partial'
             else 'pending'
           end
     where id = p_invoice_id
       and building_id = p_building_id;
  end if;

  -- Unconditional, even when no credit was consumed: monthly generation
  -- calls this once per invoice it creates, and a new invoice raises what the
  -- flat owes whether or not an advance happened to cover it. Recomputing
  -- here is what keeps outstanding_dues correct without billing.ts doing its
  -- own arithmetic (which is how it drifted before).
  perform public.bms_recalc_flat_dues_unchecked(p_building_id, p_flat_id);

  return jsonb_build_object('applied', v_applied, 'count', v_count);
end;
$function$;

comment on function public.bms_apply_flat_credits is
  'Consume advance held on account against one invoice by re-attaching the existing advance payment row (splitting it when the invoice is smaller), rather than inserting a credit_carryforward row that would double-count the same rupees. admin / super_admin only.';

revoke all on function public.bms_apply_flat_credits(uuid, uuid, uuid) from public;
revoke all on function public.bms_apply_flat_credits(uuid, uuid, uuid) from anon;
grant execute on function public.bms_apply_flat_credits(uuid, uuid, uuid) to authenticated;
