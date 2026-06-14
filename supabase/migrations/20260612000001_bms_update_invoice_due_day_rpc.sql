-- SECURITY DEFINER RPC: update only the invoice_due_day column.
-- Validates role, tenant, demo flag, and range — mirrors the action-layer
-- checks as defence-in-depth. Replaces direct .update() calls that relied on
-- bms_buildings_admin_update (dropped in 20260522010000).

CREATE OR REPLACE FUNCTION public.bms_update_invoice_due_day(
  p_due_day smallint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_building_id uuid := bms_current_building();
  v_role        text;
  v_is_demo     boolean;
BEGIN
  IF v_building_id IS NULL THEN
    RAISE EXCEPTION 'No building assigned';
  END IF;

  SELECT role, COALESCE(is_demo, false)
    INTO v_role, v_is_demo
    FROM public.bms_profiles
   WHERE id = auth.uid();

  IF v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_is_demo THEN
    RAISE EXCEPTION 'Demo accounts are read-only';
  END IF;

  IF p_due_day IS NULL OR p_due_day < 1 OR p_due_day > 28 THEN
    RAISE EXCEPTION 'Invoice due day must be between 1 and 28';
  END IF;

  UPDATE public.bms_buildings
     SET invoice_due_day = p_due_day
   WHERE id = v_building_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bms_update_invoice_due_day(smallint) FROM public;
GRANT EXECUTE ON FUNCTION public.bms_update_invoice_due_day(smallint) TO authenticated;
