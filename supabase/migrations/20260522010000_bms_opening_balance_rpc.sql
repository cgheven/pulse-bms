-- Replace the broad `bms_buildings_admin_update` permissive policy with a
-- narrow SECURITY DEFINER RPC. The previous policy let admin PATCH any
-- column on their building via direct PostgREST (bypassing the existing
-- `bms_update_building_settings` whitelist + validation). The RPC pattern
-- keeps writes server-side, audited, and column-scoped.

drop policy if exists bms_buildings_admin_update on public.bms_buildings;

-- RPC: only updates the three opening-balance columns (incl. legacy
-- fund_balance until the duplicate column is retired). Validates role,
-- tenant, demo flag, amount + date — mirrors the action-layer checks as
-- defence-in-depth.
create or replace function public.bms_update_opening_balance(
  p_amount numeric,
  p_date date
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid := bms_current_building();
  v_role text;
  v_is_demo boolean;
begin
  if v_building_id is null then
    raise exception 'No building assigned';
  end if;

  select role, coalesce(is_demo, false)
    into v_role, v_is_demo
    from public.bms_profiles
   where id = auth.uid();

  if v_role not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  if v_is_demo then
    raise exception 'Demo accounts are read-only';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Opening balance must be zero or a positive number';
  end if;

  if p_date is null then
    raise exception 'As-of date is required';
  end if;

  if p_date > current_date then
    raise exception 'As-of date cannot be in the future';
  end if;

  update public.bms_buildings
     set opening_balance_amount = p_amount,
         opening_balance_date   = p_date,
         fund_balance           = p_amount
   where id = v_building_id;
end;
$$;

revoke all on function public.bms_update_opening_balance(numeric, date) from public;
grant execute on function public.bms_update_opening_balance(numeric, date) to authenticated;

-- Defence-in-depth CHECK constraints: even if some future RLS slip lets
-- admin PATCH directly, garbage values get rejected at the column level.
alter table public.bms_buildings
  add constraint bms_buildings_fees_nonneg check (
    coalesce(monthly_fee_default, 0) >= 0
    and coalesce(entry_fee_owner, 0) >= 0
    and coalesce(entry_fee_tenant, 0) >= 0
    and coalesce(opening_balance_amount, 0) >= 0
    and coalesce(fund_balance, 0) >= 0
  );

alter table public.bms_buildings
  add constraint bms_buildings_utility_cutoff_range check (
    utility_cutoff_after_months is null
    or utility_cutoff_after_months between 1 and 24
  );
