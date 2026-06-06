-- ─── Flat limit trigger: acquire FOR UPDATE to eliminate race condition ────────
-- Without this lock, two concurrent flat inserts both pass the count check
-- and commit at N+2 when the limit is N+1 (direct billing leak).

CREATE OR REPLACE FUNCTION bms_enforce_flat_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  -- FOR UPDATE serializes concurrent inserts for the same building
  SELECT flat_limit INTO v_limit
  FROM bms_buildings
  WHERE id = NEW.building_id
  FOR UPDATE;

  IF COALESCE(v_limit, 0) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM bms_flats
  WHERE building_id = NEW.building_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION
      'Flat limit reached. This building is licensed for % flat(s) only. Contact your administrator to increase the limit.',
      v_limit;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── CHECK constraint: prevent negative flat_limit locking all inserts ────────
ALTER TABLE bms_buildings
  ADD CONSTRAINT bms_buildings_flat_limit_check CHECK (flat_limit >= 0);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- trial_created_by: used by the trials page filter on every load
CREATE INDEX IF NOT EXISTS bms_buildings_trial_created_by_idx
  ON public.bms_buildings (trial_created_by)
  WHERE trial_created_by IS NOT NULL;

-- bms_flats.building_id: used by the flat-limit trigger COUNT(*) on every insert
-- and by trial-expiry RLS correlated subqueries
CREATE INDEX IF NOT EXISTS bms_flats_building_id_idx
  ON public.bms_flats (building_id);
