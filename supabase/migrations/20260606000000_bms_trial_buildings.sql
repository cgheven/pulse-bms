-- =============================================================================
-- Migration: Trial Building Support
-- Adds trial/demo building columns, credentials table, and write-block RLS
-- policies for expired trials. Used by the Sales team to provision temporary
-- demo environments for prospects.
-- =============================================================================

-- ─── 1. Add trial columns to bms_buildings ────────────────────────────────────

ALTER TABLE public.bms_buildings
  ADD COLUMN IF NOT EXISTS is_trial          BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_ends_at     TIMESTAMPTZ          ,
  ADD COLUMN IF NOT EXISTS trial_duration_days INTEGER           ,
  ADD COLUMN IF NOT EXISTS trial_created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial indexes — only trial buildings need these scans
CREATE INDEX IF NOT EXISTS bms_buildings_is_trial_idx
  ON public.bms_buildings (is_trial)
  WHERE is_trial = true;

CREATE INDEX IF NOT EXISTS bms_buildings_trial_ends_at_idx
  ON public.bms_buildings (trial_ends_at)
  WHERE is_trial = true;

-- ─── 2. Trial credentials table ───────────────────────────────────────────────
-- Stores the plain-text login credentials generated for each trial building
-- so the sales team can share them with prospects. Protected by RLS — only
-- super_admin and sales roles can read or write.

CREATE TABLE IF NOT EXISTS public.bms_trial_credentials (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id      UUID        NOT NULL REFERENCES public.bms_buildings(id) ON DELETE CASCADE,
  admin_profile_id UUID        NOT NULL REFERENCES public.bms_profiles(id)  ON DELETE CASCADE,
  login_email      TEXT        NOT NULL,
  login_password   TEXT        NOT NULL,
  created_by       UUID                    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One credential set per trial building
CREATE UNIQUE INDEX IF NOT EXISTS bms_trial_credentials_building_idx
  ON public.bms_trial_credentials (building_id);

-- ─── 3. RLS on bms_trial_credentials ─────────────────────────────────────────

ALTER TABLE public.bms_trial_credentials ENABLE ROW LEVEL SECURITY;

-- SELECT: super_admin and sales only
CREATE POLICY bms_trial_credentials_select
  ON public.bms_trial_credentials
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bms_profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'sales')
        AND is_active = true
    )
  );

-- INSERT: super_admin and sales only
CREATE POLICY bms_trial_credentials_insert
  ON public.bms_trial_credentials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bms_profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'sales')
        AND is_active = true
    )
  );

-- UPDATE: super_admin and sales only
CREATE POLICY bms_trial_credentials_update
  ON public.bms_trial_credentials
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bms_profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'sales')
        AND is_active = true
    )
  );

-- DELETE: super_admin only
CREATE POLICY bms_trial_credentials_delete
  ON public.bms_trial_credentials
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bms_profiles
      WHERE id = auth.uid()
        AND role = 'super_admin'
        AND is_active = true
    )
  );

-- ─── 4. Write-block RLS on building-scoped tables ─────────────────────────────
-- RESTRICTIVE policies: block INSERT/UPDATE/DELETE on any table when the
-- building is a trial AND the trial has expired. These fire in addition to the
-- existing permissive policies — all conditions must pass.
--
-- Condition: allows writes when:
--   (a) building is not a trial, OR
--   (b) trial is still active (trial_ends_at >= NOW() or trial_ends_at IS NULL)

-- bms_flats
CREATE POLICY bms_flats_trial_block
  ON public.bms_flats
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  );

-- bms_residents
CREATE POLICY bms_residents_trial_block
  ON public.bms_residents
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  );

-- bms_invoices
CREATE POLICY bms_invoices_trial_block
  ON public.bms_invoices
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  );

-- bms_payments
CREATE POLICY bms_payments_trial_block
  ON public.bms_payments
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  );

-- bms_expenses
CREATE POLICY bms_expenses_trial_block
  ON public.bms_expenses
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  );

-- bms_staff
CREATE POLICY bms_staff_trial_block
  ON public.bms_staff
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  );

-- bms_notices
CREATE POLICY bms_notices_trial_block
  ON public.bms_notices
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.bms_buildings
      WHERE id = building_id
        AND is_trial = true
        AND trial_ends_at < NOW()
    )
  );
