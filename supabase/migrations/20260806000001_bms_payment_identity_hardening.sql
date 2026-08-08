-- Payment identity and receipt-number hardening.
--
-- A security review of the advance-payment work found that the guarantees the
-- new RPCs make are only as strong as the table underneath them. The RPCs
-- were sound; `bms_payments` was still writable around them.
--
-- Two findings, both fixed here in one BEFORE INSERT trigger, plus the removal
-- of a function that no longer does anything.
--
-- ── H1: the receiver on a receipt was forgeable ────────────────────────
--
-- `bms_record_payment_allocated` derives `received_by_*` from auth.uid()
-- precisely so that "who took the cash" cannot be forged. But
-- `bms_payments_union_insert` and `bms_payments_accountant_insert` allow a
-- direct INSERT with arbitrary column values, and nothing pinned the identity
-- columns. A committee officer could insert a payment, name the building
-- president as the person who received it, and print a valid receipt.
--
-- Identity now belongs to the trigger, which every insert path goes through.
--
-- ── H2: one row could brick a building's payment recording ─────────────
--
-- The trigger honoured a caller-supplied `receipt_no`, and the column is
-- int4. Inserting 2147483647 made the next allocation compute
-- `max(receipt_no) + 1` and raise `22003 integer out of range` — for every
-- subsequent payment in that building, forever. The retry loop catches only
-- unique_violation, so it did not help. Recovery meant finding and deleting
-- the poisoned row.
--
-- A caller-supplied number is now accepted only from an unauthenticated
-- context — that means `service_role`, i.e. imports and back-office scripts,
-- which are already fully trusted — and is bounded regardless.

create or replace function public.bms_payments_assign_receipt_no()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  attempt     int := 0;
  v_uid       uuid := auth.uid();
  v_role      text;
  v_slug      text;
  v_inherited boolean := false;
begin
  -- A row that does not declare a group is its own group, and therefore an
  -- anchor. Must run before the anchor test below.
  if new.payment_group_id is null then
    new.payment_group_id := new.id;
  end if;

  -- ── Identity (H1) ────────────────────────────────────────────────────
  -- Pinned for every authenticated caller, whichever path they came in by:
  -- the allocation RPC, a direct INSERT permitted by RLS, or anything added
  -- later. auth.uid() is null only for service_role — imports carry their own
  -- historical receiver names and are trusted, so they are left alone.
  if v_uid is not null then
    -- Who performed this write. Always the real caller — for a credit split
    -- during invoice generation that genuinely is the admin, not the officer
    -- who took the cash months earlier.
    new.recorded_by := v_uid;

    select p.role into v_role
      from public.bms_profiles p where p.id = v_uid;

    -- A non-anchor row is an allocation of a receipt that already exists, so
    -- the collector is whoever the anchor says it is. Without this, splitting
    -- an advance across a later month would restamp it with the name of the
    -- admin who happened to run generation, quietly rewriting who collected
    -- money last year. The anchor is always inserted before its children.
    if new.payment_group_id <> new.id then
      select a.received_by_profile_id, a.received_by_name, a.received_by_position
        into new.received_by_profile_id, new.received_by_name, new.received_by_position
        from public.bms_payments a
       where a.id = new.payment_group_id
         and a.building_id = new.building_id;
      v_inherited := found;
    end if;

    if v_inherited then
      null; -- collector already taken from the anchor
    elsif v_role = 'super_admin' then
      -- A system actor, not someone who physically collected cash.
      new.received_by_profile_id := null;
      new.received_by_name       := null;
      new.received_by_position   := null;
    else
      new.received_by_profile_id := v_uid;

      select p.full_name into new.received_by_name
        from public.bms_profiles p where p.id = v_uid;

      -- Highest-authority active position, mirroring UNION_POSITION_PRIORITY
      -- in lib/union-positions.ts.
      select m.position into v_slug
        from public.bms_union_members m
       where m.profile_id = v_uid
         and m.building_id = new.building_id
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
      new.received_by_position := case v_slug
        when 'president'      then 'President'
        when 'vp'             then 'Vice President'
        when 'vice_president' then 'Vice President'
        when 'secretary'      then 'Secretary'
        when 'treasurer'      then 'Treasurer'
        when 'member'         then 'Member'
        else initcap(replace(v_slug, '_', ' '))
      end;

      -- Admin role = building President by convention when they have not
      -- been seeded into bms_union_members yet.
      if new.received_by_position is null and v_role = 'admin' then
        new.received_by_position := 'President';
      end if;
    end if;
  end if;

  -- ── Receipt number (H2) ──────────────────────────────────────────────
  -- Only an unauthenticated context (service_role: imports, back-office) may
  -- choose its own number, and even then it must stay well inside int4 so it
  -- can never poison the max()+1 allocation below.
  if new.receipt_no is not null then
    if v_uid is not null then
      -- An authenticated caller does not get to pick. Fall through and
      -- allocate normally rather than erroring: legacy payloads that carry a
      -- stale receipt_no should still record.
      new.receipt_no := null;
    elsif new.receipt_no < 1 or new.receipt_no > 2000000000 then
      raise exception 'receipt_no out of range' using errcode = '22003';
    else
      return new;
    end if;
  end if;

  -- Non-anchor rows are allocations of a receipt that already exists, not
  -- receipts of their own. Leave receipt_no NULL — one physical collection
  -- issues exactly one receipt number.
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
  -- against any future code path that bypasses the trigger and races
  -- with a normal insert.
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
  'BEFORE INSERT on bms_payments. Defaults payment_group_id to the row''s own id; pins recorded_by and the received_by_* snapshot to auth.uid() so a receipt cannot name someone else as having taken the cash; allocates a per-building monotonic receipt_no to group ANCHORS only. Caller-supplied receipt numbers are ignored for authenticated callers and bounded for service_role.';

-- ── L6: retire the lock function that never locked anything ────────────
--
-- `bms_record_payment_with_lock` took pg_advisory_xact_lock and returned,
-- which released it — PostgREST gives every request its own transaction, so
-- it was gone before the inserts it was meant to protect ever ran. The
-- allocation RPC now holds the lock across the real work, and nothing in the
-- app calls this any more.
--
-- It is also unauthenticated and callable by anon, and its two distinct error
-- messages ('invoice % not found' vs 'does not belong to building %') form a
-- cross-tenant existence oracle. Small, but there is no reason to keep it.
drop function if exists public.bms_record_payment_with_lock(uuid, uuid, uuid);

-- ── L5: anon should not hold EXECUTE on money-moving functions ─────────
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to anon at CREATE
-- FUNCTION time, which `revoke ... from public` does not undo. Each of these
-- rejects anon at its auth.uid() check anyway; this removes the surface.
revoke all on function public.bms_delete_payment_group(uuid, uuid) from anon;
revoke all on function public.bms_apply_flat_credits(uuid, uuid, uuid) from anon;
