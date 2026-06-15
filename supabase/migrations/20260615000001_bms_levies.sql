-- bms_levies: admin-created shared-cost levy definitions
CREATE TABLE public.bms_levies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id         uuid NOT NULL REFERENCES public.bms_buildings(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  total_cost          numeric(12,2) NOT NULL CHECK (total_cost > 0),
  fund_contribution   numeric(12,2) NOT NULL DEFAULT 0 CHECK (fund_contribution >= 0),
  per_resident_amount numeric(12,2),        -- set at distribution time
  resident_count      integer,              -- snapshot at distribution time
  is_recurring        boolean NOT NULL DEFAULT false,
  recurrence_day      smallint CHECK (recurrence_day IS NULL OR (recurrence_day >= 1 AND recurrence_day <= 28)),
  due_date            date NOT NULL,
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'distributed', 'cancelled')),
  distributed_at      timestamptz,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bms_levies_building_idx ON public.bms_levies(building_id);
ALTER TABLE public.bms_levies ENABLE ROW LEVEL SECURITY;

-- All users in the building can see levies (residents need context for their charges)
CREATE POLICY bms_levies_select ON public.bms_levies
  FOR SELECT TO authenticated
  USING (
    building_id IN (
      SELECT building_id FROM public.bms_profiles
       WHERE id = auth.uid() AND building_id IS NOT NULL
    )
  );

CREATE POLICY bms_levies_insert ON public.bms_levies
  FOR INSERT TO authenticated
  WITH CHECK (bms_can_write_building(building_id));

CREATE POLICY bms_levies_update ON public.bms_levies
  FOR UPDATE TO authenticated
  USING  (bms_can_write_building(building_id))
  WITH CHECK (bms_can_write_building(building_id));

CREATE POLICY bms_levies_delete ON public.bms_levies
  FOR DELETE TO authenticated
  USING (bms_can_write_building(building_id));

-- bms_levy_charges: per-resident charge rows generated when a levy is distributed
CREATE TABLE public.bms_levy_charges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id  uuid NOT NULL REFERENCES public.bms_buildings(id) ON DELETE CASCADE,
  levy_id      uuid NOT NULL REFERENCES public.bms_levies(id) ON DELETE CASCADE,
  resident_id  uuid NOT NULL REFERENCES public.bms_residents(id),
  flat_id      uuid NOT NULL REFERENCES public.bms_flats(id),
  amount       numeric(12,2) NOT NULL CHECK (amount >= 0),
  due_date     date NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'paid', 'waived')),
  paid_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bms_levy_charges_levy_idx     ON public.bms_levy_charges(levy_id);
CREATE INDEX bms_levy_charges_resident_idx ON public.bms_levy_charges(resident_id);
CREATE INDEX bms_levy_charges_building_idx ON public.bms_levy_charges(building_id);
ALTER TABLE public.bms_levy_charges ENABLE ROW LEVEL SECURITY;

-- Admin/union see all charges for their building; residents see their own
CREATE POLICY bms_levy_charges_select ON public.bms_levy_charges
  FOR SELECT TO authenticated
  USING (
    bms_in_building(building_id)
    OR resident_id IN (
      SELECT id FROM public.bms_residents WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY bms_levy_charges_insert ON public.bms_levy_charges
  FOR INSERT TO authenticated
  WITH CHECK (bms_can_write_building(building_id));

CREATE POLICY bms_levy_charges_update ON public.bms_levy_charges
  FOR UPDATE TO authenticated
  USING  (bms_can_write_building(building_id))
  WITH CHECK (bms_can_write_building(building_id));

CREATE POLICY bms_levy_charges_delete ON public.bms_levy_charges
  FOR DELETE TO authenticated
  USING (bms_can_write_building(building_id));
