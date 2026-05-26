-- SECURITY DEFINER RPC: update only the two transparency toggle columns.
-- Validates role, tenant, demo flag — mirrors the action-layer checks as
-- defence-in-depth. Same pattern as bms_update_opening_balance.

create or replace function public.bms_update_transparency_settings(
  p_show_building_funds boolean,
  p_show_defaulters     boolean
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

  if p_show_building_funds is null or p_show_defaulters is null then
    raise exception 'Both toggle values are required';
  end if;

  update public.bms_buildings
     set show_building_funds = p_show_building_funds,
         show_defaulters     = p_show_defaulters
   where id = v_building_id;
end;
$$;

revoke all on function public.bms_update_transparency_settings(boolean, boolean) from public;
grant execute on function public.bms_update_transparency_settings(boolean, boolean) to authenticated;
