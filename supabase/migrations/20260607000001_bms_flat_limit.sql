-- ─── Flat limit enforcement ───────────────────────────────────────────────────
-- Every building has a licensed flat count (flat_limit). Default 99.
-- A DB-level BEFORE INSERT trigger on bms_flats enforces this hard cap.
-- flat_limit = 0 means no limit (reserved for internal/unlimited buildings).

ALTER TABLE bms_buildings
  ADD COLUMN IF NOT EXISTS flat_limit INTEGER NOT NULL DEFAULT 99;

-- ─── Trigger function ─────────────────────────────────────────────────────────

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
  SELECT flat_limit INTO v_limit
  FROM bms_buildings
  WHERE id = NEW.building_id;

  -- 0 = no limit (internal/unlimited buildings)
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

-- Drop and recreate so the function body update is picked up
DROP TRIGGER IF EXISTS bms_enforce_flat_limit ON bms_flats;

CREATE TRIGGER bms_enforce_flat_limit
  BEFORE INSERT ON bms_flats
  FOR EACH ROW
  EXECUTE FUNCTION bms_enforce_flat_limit();

COMMENT ON COLUMN bms_buildings.flat_limit IS
  'Maximum flats allowed in this building (licensing). 0 = unlimited. Enforced by bms_enforce_flat_limit trigger.';
