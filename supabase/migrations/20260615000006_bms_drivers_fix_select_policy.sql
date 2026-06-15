-- FIX: the original bms_drivers SELECT policy used bms_in_building(), which is a
-- *member* check (true for any resident in the building) — this leaked every
-- resident's drivers/photos to every other resident. Restrict reads to:
-- admin/super (bms_can_write_building), union (explicit, read-only), and the
-- owner resident.
DROP POLICY IF EXISTS bms_drivers_select ON public.bms_drivers;

CREATE POLICY bms_drivers_select ON public.bms_drivers
  FOR SELECT TO authenticated
  USING (
    bms_can_write_building(building_id)
    OR EXISTS (
      SELECT 1 FROM public.bms_profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'union'
        AND p.building_id = building_id
    )
    OR resident_id IN (
      SELECT id FROM public.bms_residents WHERE profile_id = auth.uid()
    )
  );
