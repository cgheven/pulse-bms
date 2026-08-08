-- bms_record_payment_allocated — record one physical collection, atomically.
--
-- WHY THIS IS A DATABASE FUNCTION
--
-- Recording six months of advance maintenance touches ~15 rows across three
-- tables. The previous TypeScript implementation did that as ~15 separate
-- PostgREST calls, which means ~15 separate transactions. Two consequences:
--
--   1. A dropped connection halfway leaves invoices created but unpaid, or
--      outstanding_dues decremented with no payment row behind it.
--   2. The advisory lock meant to serialise concurrent recorders did nothing.
--      `bms_record_payment_with_lock` takes pg_advisory_xact_lock, which is
--      released at transaction end — and PostgREST ends the transaction when
--      that one RPC returns, before any of the inserts it was meant to
--      protect. The guard has never actually held.
--
-- Doing the whole waterfall in one function makes it one transaction and lets
-- the lock cover the work it was written for.
--
-- WHY SECURITY DEFINER
--
-- The `union` role can insert into bms_payments (policy
-- bms_payments_union_insert) but has NO insert policy on bms_invoices, and
-- committee officers legitimately collect advance payments door to door. So
-- the function must create invoices on their behalf. That bypasses RLS, so
-- every check RLS would have applied is re-implemented below, explicitly and
-- before any write:
--
--   * caller is authenticated                       (auth.uid() not null)
--   * caller's role may record payments
--   * caller may write to THIS building             (never trusts the argument)
--   * caller is not a demo user                     (bms_*_demo_deny_* policies)
--   * the building is not an expired trial          (bms_*_trial_block policies)
--   * flat / invoice / bank account / project / resident all belong to it
--
-- Execute is revoked from PUBLIC at the bottom and granted to `authenticated`
-- only.
--
-- See docs/advance-payment-plan.md §3 for the model, §4 for the edge cases
-- each guard corresponds to.

-- ─── Shared helper: rebuild a flat's outstanding dues from source ───────
--
-- bms_flats.outstanding_dues is a denormalised cache, and it has drifted:
-- flat A-1 of Hill Park stores Rs. 15,000 against Rs. 20,000 of genuinely
-- pending invoices. Every previous code path nudged it by a delta, so each
-- arithmetic slip became permanent and the next slip compounded it.
--
-- Recomputing from the invoices is barely more expensive (a flat has tens of
-- rows, and it is already indexed by (building_id, flat_id)) and it is
-- self-healing: any drift is corrected the next time the flat is touched.
--
-- Definition, matching docs/advance-payment-plan.md §3.3:
--   dues = Σ over non-waived invoices of max(0, amount − payments)
-- Per-invoice flooring matters — an invoice overpaid by Rs. 500 must not
-- cancel out Rs. 500 genuinely owed on a different month. Money paid beyond
-- an invoice is tracked as advance, not as negative dues.
--
-- ── The unguarded core. NOT granted to anybody. ─────────────────────────
--
-- Split out deliberately. The three payment RPCs are SECURITY DEFINER, but
-- `auth.uid()` inside them still resolves to the real caller — so a guarded
-- version called from within them would have to accept every role that may
-- record a payment, including `union`. That is exactly the hole a security
-- review found: combined with a direct INSERT into bms_payments, a committee
-- officer could zero a flat's dues, clearing it on the resident portal and
-- dropping it off the defaulter report.
--
-- So authorisation lives with the callers, each of which has already proven
-- who the caller is and what they may touch before reaching this. Nothing is
-- granted here; only functions owned by the same role can reach it.
create or replace function public.bms_recalc_flat_dues_unchecked(
  p_building_id uuid,
  p_flat_id     uuid
)
returns numeric
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  update public.bms_flats f
     set outstanding_dues = coalesce((
           select sum(greatest(0, i.amount - coalesce((
                    select sum(pp.amount)
                      from public.bms_payments pp
                     where pp.invoice_id = i.id
                       and pp.building_id = p_building_id
                  ), 0)))
             from public.bms_invoices i
            where i.building_id = p_building_id
              and i.flat_id = p_flat_id
              and coalesce(i.status, '') <> 'waived'
         ), 0)
   where f.id = p_flat_id
     and f.building_id = p_building_id
  returning f.outstanding_dues;
$function$;

comment on function public.bms_recalc_flat_dues_unchecked is
  'Rebuild bms_flats.outstanding_dues from source. NO authorisation of its own — callers must authorise first. Intentionally granted to no role; reachable only from the SECURITY DEFINER payment RPCs owned by the same user.';

revoke all on function public.bms_recalc_flat_dues_unchecked(uuid, uuid) from public;
revoke all on function public.bms_recalc_flat_dues_unchecked(uuid, uuid) from anon;
revoke all on function public.bms_recalc_flat_dues_unchecked(uuid, uuid) from authenticated;

-- ── The guarded wrapper, for direct callers ─────────────────────────────
--
-- Waiving and deleting an invoice change what a flat owes just as much as a
-- payment does, so billing.ts calls this directly. It carries the SAME guard
-- set as the other three RPCs — authentication, demo, expired trial, and
-- write access to the building — because bms_flats is protected by RESTRICTIVE
-- `bms_flats_demo_deny_upd` and `bms_flats_trial_block` policies that SECURITY
-- DEFINER would otherwise walk straight past.
--
-- Write access, not read access: this mutates. Only the roles that may change
-- a building's money get in.
create or replace function public.bms_recalc_flat_dues(
  p_building_id uuid,
  p_flat_id     uuid
)
returns numeric
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_demo boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select p.role, coalesce(p.is_demo, false) into v_role, v_demo
    from public.bms_profiles p where p.id = v_uid;

  if v_role is null then
    raise exception 'No profile for the current user' using errcode = '28000';
  end if;

  if v_demo then
    raise exception 'Demo accounts cannot change balances' using errcode = '42501';
  end if;

  if not (
    v_role = 'super_admin'
    or (v_role = 'admin' and public.bms_can_write_building(p_building_id))
  ) then
    raise exception 'Not allowed for this building' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.bms_buildings b
     where b.id = p_building_id
       and b.is_trial = true
       and b.trial_ends_at < now()
  ) then
    raise exception 'This building''s trial has ended' using errcode = '42501';
  end if;

  return public.bms_recalc_flat_dues_unchecked(p_building_id, p_flat_id);
end;
$function$;

comment on function public.bms_recalc_flat_dues is
  'Rebuild bms_flats.outstanding_dues from the invoices themselves: the sum over non-waived invoices of max(0, amount - payments). Guarded entry point for invoice waive/delete; the payment RPCs call the _unchecked core after doing their own authorisation.';

revoke all on function public.bms_recalc_flat_dues(uuid, uuid) from public;
revoke all on function public.bms_recalc_flat_dues(uuid, uuid) from anon;
grant execute on function public.bms_recalc_flat_dues(uuid, uuid) to authenticated;

create or replace function public.bms_record_payment_allocated(
  p_building_id     uuid,
  p_flat_id         uuid,
  p_invoice_id      uuid    default null,
  p_resident_id     uuid    default null,
  p_amount          numeric default 0,
  p_payment_date    date    default null,
  p_payment_mode    text    default 'cash',
  p_reference_no    text    default null,
  p_category        text    default 'maintenance',
  p_notes           text    default null,
  p_bank_account_id uuid    default null,
  p_project_id      uuid    default null,
  p_advance_months  integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  -- Hard ceiling on how many months one payment may pre-create. Guards
  -- against a mistyped amount turning into hundreds of invoices (E5).
  c_max_advance_months constant integer := 24;
  -- Bound on the month-walk so a long run of existing invoices can never
  -- spin the loop (E13/E38).
  c_max_month_scan     constant integer := 120;

  v_uid              uuid := auth.uid();
  v_role             text;
  v_home_building    uuid;
  v_is_demo          boolean;
  v_full_name        text;
  v_can_write        boolean := false;

  v_date             date := coalesce(p_payment_date, current_date);
  v_ref              text := nullif(btrim(p_reference_no), '');
  v_note             text := nullif(btrim(p_notes), '');
  v_amount           numeric(12,2);
  v_remaining        numeric(12,2);
  v_apply            numeric(12,2);
  v_capacity         numeric(12,2);

  v_group            uuid := gen_random_uuid();
  v_anchor_id        uuid;
  v_row_id           uuid;

  v_recv_profile_id  uuid;
  v_recv_name        text;
  v_recv_position    text;
  v_position_slug    text;

  v_anchor_month     date;
  v_anchor_status    text;
  v_flat_number      text;
  v_flat_ownership   text;
  v_flat_fee         numeric(12,2);
  v_default_fee      numeric(12,2);
  v_fee              numeric(12,2);
  v_building_name    text;
  v_due_day          integer;
  v_prefix           text;

  v_month            date;
  v_months_created   integer := 0;
  v_scans            integer := 0;

  v_allocated        numeric(12,2) := 0;
  v_residual         numeric(12,2) := 0;
  v_credit_id        uuid;

  v_allocations      jsonb := '[]'::jsonb;
  v_created_invoices uuid[] := '{}';
  v_touched_invoices uuid[] := '{}';
  v_inv              record;
  v_new_invoice_id   uuid;
  v_paid_total       numeric(12,2);
  v_inv_amount       numeric(12,2);
  v_id               uuid;
begin
  -- ══ 1. Authentication ════════════════════════════════════════════════
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select p.role, p.building_id, coalesce(p.is_demo, false), p.full_name
    into v_role, v_home_building, v_is_demo, v_full_name
    from public.bms_profiles p
   where p.id = v_uid;

  if v_role is null then
    raise exception 'No profile for the current user' using errcode = '28000';
  end if;

  -- Mirrors the restrictive bms_*_demo_deny_ins policies, which SECURITY
  -- DEFINER would otherwise sail straight past.
  if v_is_demo then
    raise exception 'Demo accounts cannot record payments' using errcode = '42501';
  end if;

  -- ══ 2. Authorisation ═════════════════════════════════════════════════
  -- p_building_id is an argument and therefore attacker-controlled. It is
  -- never trusted: write access is proven for that exact building.
  if v_role = 'super_admin' then
    v_can_write := true;
  elsif v_role = 'admin' then
    -- Covers multi-building admins via bms_admin_buildings.
    v_can_write := public.bms_can_write_building(p_building_id);
  elsif v_role in ('union', 'accountant') then
    -- Pinned to their own building; there is no multi-building grant for
    -- these roles, matching bms_payments_union_insert.
    v_can_write := (v_home_building is not distinct from p_building_id);
  else
    v_can_write := false;
  end if;

  if not v_can_write then
    raise exception 'Not allowed to record payments for this building'
      using errcode = '42501';
  end if;

  -- Mirrors the restrictive bms_*_trial_block policies.
  if exists (
    select 1 from public.bms_buildings b
     where b.id = p_building_id
       and b.is_trial = true
       and b.trial_ends_at < now()
  ) then
    raise exception 'This building''s trial has ended' using errcode = '42501';
  end if;

  -- ══ 3. Input validation ══════════════════════════════════════════════
  v_amount := round(coalesce(p_amount, 0)::numeric, 2);
  if v_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;

  if p_payment_mode is null or p_payment_mode not in ('cash', 'bank') then
    raise exception 'Payment mode must be cash or bank' using errcode = '22023';
  end if;

  if p_category is null
     or p_category not in ('maintenance', 'entry_fee', 'fine', 'other', 'project') then
    raise exception 'Unknown payment category' using errcode = '22023';
  end if;

  -- A payment can legitimately be back-dated (cash collected last week,
  -- entered today) but not by years, and it cannot be booked far into the
  -- future. Unbounded, either direction parks money outside the range every
  -- report defaults to, which is how collections quietly go missing.
  if v_date < date '2000-01-01' or v_date > (current_date + interval '1 year') then
    raise exception 'Payment date is out of range' using errcode = '22023';
  end if;

  -- Tenancy: every referenced row must live in this building.
  select f.flat_number, f.ownership_type, f.monthly_fee
    into v_flat_number, v_flat_ownership, v_flat_fee
    from public.bms_flats f
   where f.id = p_flat_id and f.building_id = p_building_id;

  if v_flat_number is null then
    raise exception 'Invalid flat' using errcode = '23503';
  end if;

  if p_bank_account_id is not null and not exists (
    select 1 from public.bms_bank_accounts a
     where a.id = p_bank_account_id and a.building_id = p_building_id
  ) then
    raise exception 'Invalid bank account' using errcode = '23503';
  end if;

  if p_project_id is not null and not exists (
    select 1 from public.bms_projects pr
     where pr.id = p_project_id and pr.building_id = p_building_id
  ) then
    raise exception 'Invalid project' using errcode = '23503';
  end if;

  if p_resident_id is not null and not exists (
    select 1 from public.bms_residents r
     where r.id = p_resident_id and r.building_id = p_building_id
  ) then
    raise exception 'Invalid resident' using errcode = '23503';
  end if;

  -- ══ 4. Serialise against other recorders on the same flat ════════════
  -- Now genuinely effective: this transaction spans the whole allocation,
  -- so the lock is held until every row below is written.
  perform pg_advisory_xact_lock(hashtextextended(p_flat_id::text, 0));

  -- ══ 5. Receiver snapshot ═════════════════════════════════════════════
  -- Derived from auth.uid(), never from an argument, so "who took the cash"
  -- cannot be forged by calling the RPC directly.
  if v_role <> 'super_admin' then
    v_recv_profile_id := v_uid;
    v_recv_name := v_full_name;

    -- Highest-authority active position wins, mirroring
    -- UNION_POSITION_PRIORITY in lib/union-positions.ts.
    select m.position into v_position_slug
      from public.bms_union_members m
     where m.profile_id = v_uid
       and m.building_id = p_building_id
       and m.is_active = true
     order by case m.position
                when 'president'         then 1
                when 'vice_president'    then 2
                when 'vp'                then 3
                when 'secretary'         then 4
                when 'general_secretary' then 5
                when 'treasurer'         then 6
                when 'member'            then 7
                else 8
              end
     limit 1;

    -- Mirrors unionPositionLabel(); unknown slugs title-case, null stays
    -- null (initcap of null is null).
    v_recv_position := case v_position_slug
      when 'president'      then 'President'
      when 'vp'             then 'Vice President'
      when 'vice_president' then 'Vice President'
      when 'secretary'      then 'Secretary'
      when 'treasurer'      then 'Treasurer'
      when 'member'         then 'Member'
      else initcap(replace(v_position_slug, '_', ' '))
    end;

    -- Admin role = building President by convention when they have not been
    -- seeded into bms_union_members yet.
    if v_recv_position is null and v_role = 'admin' then
      v_recv_position := 'President';
    end if;
  end if;

  v_remaining := v_amount;

  -- ══ 6. Nothing to allocate across: one row, no waterfall ═════════════
  -- Entry fees, fines, project contributions and "other" never hang off a
  -- maintenance invoice (E25/E26). Likewise a maintenance payment recorded
  -- without picking an invoice — unchanged from previous behaviour, it
  -- counts as cash but touches no invoice and no dues.
  if p_category <> 'maintenance' or p_invoice_id is null then
    insert into public.bms_payments (
      id, payment_group_id, building_id, invoice_id, flat_id, resident_id,
      amount, payment_date, payment_mode, reference_no, category, notes,
      recorded_by, received_by_profile_id, received_by_name,
      received_by_position, bank_account_id, project_id
    ) values (
      v_group, v_group, p_building_id, null, p_flat_id, p_resident_id,
      v_amount, v_date, p_payment_mode, v_ref, p_category, v_note, v_uid,
      v_recv_profile_id, v_recv_name, v_recv_position, p_bank_account_id,
      p_project_id
    );

    v_anchor_id := v_group;

    if p_category = 'entry_fee' and p_resident_id is not null then
      update public.bms_residents
         set entry_fee_paid = coalesce(entry_fee_paid, 0) + v_amount
       where id = p_resident_id
         and building_id = p_building_id;
    end if;

    return jsonb_build_object(
      'group_id',          v_group,
      'anchor_payment_id', v_anchor_id,
      'receipt_no',        (select pp.receipt_no from public.bms_payments pp
                             where pp.id = v_anchor_id),
      'total',             v_amount,
      'allocations',       '[]'::jsonb,
      'created_invoices',  '[]'::jsonb,
      'months_created',    0,
      'residual_credit',   0,
      'credit_id',         null
    );
  end if;

  -- ══ 7. Anchor invoice must be this flat's, and payable ═══════════════
  select i.billing_month, i.status
    into v_anchor_month, v_anchor_status
    from public.bms_invoices i
   where i.id = p_invoice_id
     and i.building_id = p_building_id
     and i.flat_id = p_flat_id;

  if v_anchor_month is null then
    raise exception 'Invalid invoice' using errcode = '23503';
  end if;

  if v_anchor_status = 'waived' then
    raise exception 'That invoice has been waived' using errcode = '22023';
  end if;

  -- Billing context, needed only if we bill months ahead below.
  select b.name, b.monthly_fee_default, b.invoice_due_day
    into v_building_name, v_default_fee, v_due_day
    from public.bms_buildings b
   where b.id = p_building_id;

  -- Flat fee, else the building default. Null or non-positive means a future
  -- month cannot be sized, so none get created (E6/E7).
  v_fee := coalesce(v_flat_fee, v_default_fee);
  if v_fee is null or v_fee <= 0 then
    v_fee := null;
  end if;

  v_due_day := least(28, greatest(1, coalesce(v_due_day, 10)));

  -- Mirrors buildInvoiceNumber() in app/actions/billing.ts: first three
  -- characters of the building name, punctuation stripped, uppercased.
  v_prefix := upper(regexp_replace(left(coalesce(v_building_name, 'B'), 3),
                                   '[^A-Za-z0-9]', '', 'g'));
  if v_prefix = '' then
    v_prefix := 'BLD';
  end if;

  -- ══ 8. Waterfall step 1 — arrears, oldest first ══════════════════════
  -- Money settles the oldest debt before it runs ahead. Previously the
  -- surplus only ever walked forward, so a flat could pre-pay six months
  -- while still showing as a defaulter for an unpaid month behind it (D3).
  for v_inv in
    select i.id, i.amount, i.billing_month
      from public.bms_invoices i
     where i.building_id = p_building_id
       and i.flat_id = p_flat_id
       and i.billing_month < v_anchor_month
       and i.status in ('pending', 'partial', 'overdue')
     order by i.billing_month asc
  loop
    exit when v_remaining <= 0;

    select coalesce(sum(pp.amount), 0) into v_paid_total
      from public.bms_payments pp
     where pp.invoice_id = v_inv.id and pp.building_id = p_building_id;

    v_capacity := v_inv.amount - v_paid_total;
    continue when v_capacity <= 0;

    v_apply  := least(v_capacity, v_remaining);
    v_row_id := case when v_anchor_id is null then v_group else gen_random_uuid() end;

    insert into public.bms_payments (
      id, payment_group_id, building_id, invoice_id, flat_id, resident_id,
      amount, payment_date, payment_mode, reference_no, category, notes,
      recorded_by, received_by_profile_id, received_by_name,
      received_by_position, bank_account_id
    ) values (
      v_row_id, v_group, p_building_id, v_inv.id, p_flat_id, p_resident_id,
      v_apply, v_date, p_payment_mode, v_ref, 'maintenance', v_note, v_uid,
      v_recv_profile_id, v_recv_name, v_recv_position, p_bank_account_id
    );

    v_anchor_id        := coalesce(v_anchor_id, v_row_id);
    v_remaining        := v_remaining - v_apply;
    v_allocated        := v_allocated + v_apply;
    v_touched_invoices := v_touched_invoices || v_inv.id;
    v_allocations      := v_allocations || jsonb_build_object(
      'invoice_id', v_inv.id, 'billing_month', v_inv.billing_month,
      'amount', v_apply, 'created', false
    );
  end loop;

  -- ══ 9. Waterfall step 2 — the invoice the recorder selected ══════════
  if v_remaining > 0 then
    select i.amount into v_inv_amount
      from public.bms_invoices i where i.id = p_invoice_id;

    select coalesce(sum(pp.amount), 0) into v_paid_total
      from public.bms_payments pp
     where pp.invoice_id = p_invoice_id and pp.building_id = p_building_id;

    v_capacity := v_inv_amount - v_paid_total;

    if v_capacity > 0 then
      v_apply  := least(v_capacity, v_remaining);
      v_row_id := case when v_anchor_id is null then v_group else gen_random_uuid() end;

      insert into public.bms_payments (
        id, payment_group_id, building_id, invoice_id, flat_id, resident_id,
        amount, payment_date, payment_mode, reference_no, category, notes,
        recorded_by, received_by_profile_id, received_by_name,
        received_by_position, bank_account_id
      ) values (
        v_row_id, v_group, p_building_id, p_invoice_id, p_flat_id,
        p_resident_id, v_apply, v_date, p_payment_mode, v_ref, 'maintenance',
        v_note, v_uid, v_recv_profile_id, v_recv_name, v_recv_position,
        p_bank_account_id
      );

      v_anchor_id        := coalesce(v_anchor_id, v_row_id);
      v_remaining        := v_remaining - v_apply;
      v_allocated        := v_allocated + v_apply;
      v_touched_invoices := v_touched_invoices || p_invoice_id;
      v_allocations      := v_allocations || jsonb_build_object(
        'invoice_id', p_invoice_id, 'billing_month', v_anchor_month,
        'amount', v_apply, 'created', false
      );
    end if;
  end if;

  -- ══ 10. Waterfall step 3 — existing open invoices ahead ══════════════
  -- Waived invoices are excluded by the status filter and never resurrected;
  -- already-paid ones fall out on zero capacity.
  for v_inv in
    select i.id, i.amount, i.billing_month
      from public.bms_invoices i
     where i.building_id = p_building_id
       and i.flat_id = p_flat_id
       and i.billing_month > v_anchor_month
       and i.status in ('pending', 'partial', 'overdue')
     order by i.billing_month asc
  loop
    exit when v_remaining <= 0;

    select coalesce(sum(pp.amount), 0) into v_paid_total
      from public.bms_payments pp
     where pp.invoice_id = v_inv.id and pp.building_id = p_building_id;

    v_capacity := v_inv.amount - v_paid_total;
    continue when v_capacity <= 0;

    v_apply  := least(v_capacity, v_remaining);
    v_row_id := case when v_anchor_id is null then v_group else gen_random_uuid() end;

    insert into public.bms_payments (
      id, payment_group_id, building_id, invoice_id, flat_id, resident_id,
      amount, payment_date, payment_mode, reference_no, category, notes,
      recorded_by, received_by_profile_id, received_by_name,
      received_by_position, bank_account_id
    ) values (
      v_row_id, v_group, p_building_id, v_inv.id, p_flat_id, p_resident_id,
      v_apply, v_date, p_payment_mode, v_ref, 'maintenance', v_note, v_uid,
      v_recv_profile_id, v_recv_name, v_recv_position, p_bank_account_id
    );

    v_anchor_id        := coalesce(v_anchor_id, v_row_id);
    v_remaining        := v_remaining - v_apply;
    v_allocated        := v_allocated + v_apply;
    v_touched_invoices := v_touched_invoices || v_inv.id;
    v_allocations      := v_allocations || jsonb_build_object(
      'invoice_id', v_inv.id, 'billing_month', v_inv.billing_month,
      'amount', v_apply, 'created', false
    );
  end loop;

  -- ══ 11. Waterfall step 4 — bill the months ahead ═════════════════════
  -- This is what makes "paid through January" true rather than implied. The
  -- invoices exist, so monthly generation skips them (existingSet in
  -- billing.ts), the defaulter report stays quiet, and nothing waits on an
  -- admin remembering to press a button.
  --
  -- Skipped for vacant flats, mirroring generateMonthlyInvoices which does
  -- not bill them (E17), and when no usable fee exists (E6/E7).
  if v_remaining > 0
     and p_advance_months > 0
     and v_fee is not null
     and coalesce(v_flat_ownership, '') <> 'vacant'
  then
    -- Walk from the anchor, NOT from the flat's latest invoice.
    --
    -- Seeding at max(billing_month) looked equivalent and is not: that max
    -- covers paid and waived invoices too, so any unbilled month between the
    -- anchor and it was jumped clean over. A flat billed Jan–Jun plus a
    -- stray Sep, paying eight months ahead in June, got Sep onward created
    -- and July and August silently missed — and the next monthly generation
    -- would raise them as fresh unpaid bills against someone who had already
    -- handed the money over. Nine live flats have exactly that shape.
    --
    -- Starting at the anchor makes the `continue when exists` guard below do
    -- the real work: step over months that exist, bill the ones that do not.
    v_month := v_anchor_month;

    while v_remaining >= v_fee
      and v_months_created < least(p_advance_months, c_max_advance_months)
      and v_scans < c_max_month_scan
    loop
      v_scans := v_scans + 1;
      v_month := (v_month + interval '1 month')::date;

      -- A month may already exist and be paid or waived — step 3 consumed
      -- every open one. Step over it rather than colliding with the unique
      -- index on (building_id, flat_id, billing_month).
      continue when exists (
        select 1 from public.bms_invoices i
         where i.building_id = p_building_id
           and i.flat_id = p_flat_id
           and i.billing_month = v_month
      );

      v_new_invoice_id := null;

      -- ON CONFLICT is unavailable here: bms_invoices carries two unique
      -- constraints on (building_id, flat_id, billing_month) and one of them
      -- (bms_invoices_unique_monthly) is DEFERRABLE, which Postgres refuses
      -- to use as an arbiter. Catching the violation in a subtransaction is
      -- equivalent and does not depend on a constraint name. The
      -- non-deferrable twin raises immediately, so this handler does fire.
      begin
        insert into public.bms_invoices (
          building_id, flat_id, invoice_number, billing_month, amount,
          status, due_date, created_by_payment_group
        ) values (
          p_building_id, p_flat_id,
          upper('INV-' || v_prefix || '-' || v_flat_number || '-' ||
                to_char(v_month, 'YYYYMM')),
          v_month, v_fee, 'pending',
          (v_month + (v_due_day - 1)),
          v_group
        )
        returning id into v_new_invoice_id;
      exception when unique_violation then
        v_new_invoice_id := null;
      end;

      -- Lost a race with monthly generation: the month now exists and was
      -- not ours to fill. Move on.
      continue when v_new_invoice_id is null;

      v_row_id := case when v_anchor_id is null then v_group else gen_random_uuid() end;

      insert into public.bms_payments (
        id, payment_group_id, building_id, invoice_id, flat_id, resident_id,
        amount, payment_date, payment_mode, reference_no, category, notes,
        recorded_by, received_by_profile_id, received_by_name,
        received_by_position, bank_account_id
      ) values (
        v_row_id, v_group, p_building_id, v_new_invoice_id, p_flat_id,
        p_resident_id, v_fee, v_date, p_payment_mode, v_ref, 'maintenance',
        v_note, v_uid, v_recv_profile_id, v_recv_name, v_recv_position,
        p_bank_account_id
      );

      v_anchor_id        := coalesce(v_anchor_id, v_row_id);
      v_remaining        := v_remaining - v_fee;
      v_allocated        := v_allocated + v_fee;
      v_months_created   := v_months_created + 1;
      v_created_invoices := v_created_invoices || v_new_invoice_id;
      v_touched_invoices := v_touched_invoices || v_new_invoice_id;
      v_allocations      := v_allocations || jsonb_build_object(
        'invoice_id', v_new_invoice_id, 'billing_month', v_month,
        'amount', v_fee, 'created', true
      );
    end loop;
  end if;

  -- ══ 12. Waterfall step 5 — residual sits on account ══════════════════
  -- Anything left is smaller than a month, or the flat cannot be billed
  -- ahead. It becomes a real payment row with no invoice, so the cash is
  -- counted on the day it arrived and against the right bank account (D4),
  -- plus a credit row so the next generated invoice consumes it.
  if v_remaining > 0 then
    v_residual := v_remaining;
    v_row_id   := case when v_anchor_id is null then v_group else gen_random_uuid() end;

    insert into public.bms_payments (
      id, payment_group_id, building_id, invoice_id, flat_id, resident_id,
      amount, payment_date, payment_mode, reference_no, category, notes,
      recorded_by, received_by_profile_id, received_by_name,
      received_by_position, bank_account_id
    ) values (
      v_row_id, v_group, p_building_id, null, p_flat_id, p_resident_id,
      v_residual, v_date, p_payment_mode, v_ref, 'maintenance',
      coalesce(v_note || ' — ', '') || 'Advance held on account',
      v_uid, v_recv_profile_id, v_recv_name, v_recv_position,
      p_bank_account_id
    );

    v_anchor_id := coalesce(v_anchor_id, v_row_id);

    insert into public.bms_flat_credits (
      building_id, flat_id, amount, source_payment_id, notes, created_by
    ) values (
      p_building_id, p_flat_id, v_residual, v_row_id,
      'Advance held on account', v_uid
    )
    returning id into v_credit_id;

    v_remaining := 0;
  end if;

  -- ══ 13. Re-derive invoice status from payment sums ═══════════════════
  foreach v_id in array v_touched_invoices loop
    select i.amount into v_inv_amount
      from public.bms_invoices i where i.id = v_id;

    select coalesce(sum(pp.amount), 0) into v_paid_total
      from public.bms_payments pp
     where pp.invoice_id = v_id and pp.building_id = p_building_id;

    update public.bms_invoices
       set status = case
             when v_paid_total >= v_inv_amount and v_inv_amount > 0 then 'paid'
             when v_paid_total > 0 then 'partial'
             else 'pending'
           end
     where id = v_id and building_id = p_building_id;
  end loop;

  -- ══ 14. Outstanding dues ═════════════════════════════════════════════
  -- Rebuilt from the invoices rather than nudged by a delta, so the figure
  -- is right even if it was already wrong before this call. The residual
  -- advance is deliberately NOT subtracted — no invoice exists for it yet,
  -- and it is reported separately as "advance held".
  perform public.bms_recalc_flat_dues_unchecked(p_building_id, p_flat_id);

  return jsonb_build_object(
    'group_id',          v_group,
    'anchor_payment_id', v_anchor_id,
    'receipt_no',        (select pp.receipt_no from public.bms_payments pp
                           where pp.id = v_anchor_id),
    'total',             v_amount,
    'allocations',       v_allocations,
    'created_invoices',  to_jsonb(v_created_invoices),
    'months_created',    v_months_created,
    'residual_credit',   v_residual,
    'allocated',         v_allocated,
    'credit_id',         v_credit_id
  );
end;
$function$;

comment on function public.bms_record_payment_allocated is
  'Record one physical collection atomically: settle arrears oldest-first, then the selected invoice, then existing months ahead, optionally bill further months, and hold any remainder on account. All rows share one payment_group_id, payment_date, mode and bank account. SECURITY DEFINER because union officers may record advance payments but cannot insert invoices under RLS; every RLS check is re-implemented inside.';

-- Not callable by anon or by the public role.
revoke all on function public.bms_record_payment_allocated(
  uuid, uuid, uuid, uuid, numeric, date, text, text, text, text, uuid, uuid, integer
) from public;

-- `revoke ... from public` does NOT remove this: Supabase attaches an explicit
-- anon grant via ALTER DEFAULT PRIVILEGES when the function is created. Every
-- one of these functions rejects anon at the auth.uid() check anyway, but an
-- unauthenticated role should not hold EXECUTE on a money-moving function.
revoke all on function public.bms_record_payment_allocated(
  uuid, uuid, uuid, uuid, numeric, date, text, text, text, text, uuid, uuid, integer
) from anon;

grant execute on function public.bms_record_payment_allocated(
  uuid, uuid, uuid, uuid, numeric, date, text, text, text, text, uuid, uuid, integer
) to authenticated;
