-- Demo-mode restrictive deny policies (matches pattern from bms_demo_mode migration)
CREATE POLICY bms_levies_demo_deny_ins ON public.bms_levies
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.bms_is_demo_user());

CREATE POLICY bms_levies_demo_deny_upd ON public.bms_levies
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.bms_is_demo_user());

CREATE POLICY bms_levies_demo_deny_del ON public.bms_levies
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.bms_is_demo_user());

CREATE POLICY bms_levy_charges_demo_deny_ins ON public.bms_levy_charges
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.bms_is_demo_user());

CREATE POLICY bms_levy_charges_demo_deny_upd ON public.bms_levy_charges
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.bms_is_demo_user());

CREATE POLICY bms_levy_charges_demo_deny_del ON public.bms_levy_charges
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.bms_is_demo_user());
