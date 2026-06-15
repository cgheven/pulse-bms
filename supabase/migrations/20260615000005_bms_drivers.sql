-- Personal/household drivers employed by residents. Residents maintain their own
-- records (for accountability if a driver absconds); admin/union read-only.
CREATE TABLE public.bms_drivers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.bms_buildings(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES public.bms_residents(id) ON DELETE CASCADE,
  flat_id     uuid REFERENCES public.bms_flats(id),
  full_name   text NOT NULL,
  phone       text,
  cnic        text,            -- optional, digits only (no scan stored)
  photo_path  text,            -- optional, in bms-documents bucket
  photo_mime  text,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
  left_date   date,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bms_drivers_building_idx ON public.bms_drivers(building_id);
CREATE INDEX bms_drivers_resident_idx ON public.bms_drivers(resident_id);

ALTER TABLE public.bms_drivers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER bms_drivers_touch
  BEFORE UPDATE ON public.bms_drivers
  FOR EACH ROW EXECUTE FUNCTION public.bms_touch_updated_at();

-- SELECT: admin/super (write helper) + union (explicit, read-only) + owner resident.
-- NB: bms_in_building() is a *member* check (true for any resident) and must NOT
-- be used here, or residents would see each other's drivers.
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
    OR resident_id IN (SELECT id FROM public.bms_residents WHERE profile_id = auth.uid())
  );

-- INSERT: owner resident (active, same building) or admin/super
CREATE POLICY bms_drivers_insert ON public.bms_drivers
  FOR INSERT TO authenticated
  WITH CHECK (
    bms_can_write_building(building_id)
    OR resident_id IN (
      SELECT id FROM public.bms_residents
       WHERE profile_id = auth.uid() AND is_active = true
         AND building_id = bms_drivers.building_id
    )
  );

-- UPDATE: owner resident or admin/super
CREATE POLICY bms_drivers_update ON public.bms_drivers
  FOR UPDATE TO authenticated
  USING (
    bms_can_write_building(building_id)
    OR resident_id IN (SELECT id FROM public.bms_residents WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    bms_can_write_building(building_id)
    OR resident_id IN (SELECT id FROM public.bms_residents WHERE profile_id = auth.uid())
  );

-- DELETE: owner resident or admin/super
CREATE POLICY bms_drivers_delete ON public.bms_drivers
  FOR DELETE TO authenticated
  USING (
    bms_can_write_building(building_id)
    OR resident_id IN (SELECT id FROM public.bms_residents WHERE profile_id = auth.uid())
  );

-- Demo-mode deny (matches the pattern on every other write table)
CREATE POLICY bms_drivers_demo_deny_ins ON public.bms_drivers
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.bms_is_demo_user());
CREATE POLICY bms_drivers_demo_deny_upd ON public.bms_drivers
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.bms_is_demo_user());
CREATE POLICY bms_drivers_demo_deny_del ON public.bms_drivers
  AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.bms_is_demo_user());
