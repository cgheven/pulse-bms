-- Granular control: separate toggle for the Fund Balance hero card.
-- show_building_funds now controls only the income/expense ledger.
-- show_fund_balance controls the big Rs. balance number.

alter table public.bms_buildings
  add column if not exists show_fund_balance boolean not null default false;

comment on column public.bms_buildings.show_fund_balance is
  'When true, residents can see the Building Fund Balance (total cash) on the transparency page.';

-- Update RPC to include the new column (replace old 2-arg version).
create or replace function public.bms_update_transparency_settings(
  p_show_building_funds boolean,
  p_show_defaulters     boolean,
  p_show_fund_balance   boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid := bms_current_building();
  v_role        text;
  v_is_demo     boolean;
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

  if p_show_building_funds is null or p_show_defaulters is null or p_show_fund_balance is null then
    raise exception 'All toggle values are required';
  end if;

  update public.bms_buildings
     set show_building_funds = p_show_building_funds,
         show_defaulters     = p_show_defaulters,
         show_fund_balance   = p_show_fund_balance
   where id = v_building_id;
end;
$$;

revoke all on function public.bms_update_transparency_settings(boolean, boolean, boolean) from public;
grant execute on function public.bms_update_transparency_settings(boolean, boolean, boolean) to authenticated;
