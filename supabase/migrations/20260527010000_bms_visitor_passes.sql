-- ============================================================
-- Pulse BMS — Visitor Passes (bms_visitor_passes)
--
-- Residents pre-register a visitor's vehicle plate and an entry
-- window.  The guard portal can look up pending passes in real
-- time and mark them 'verified' on arrival.
--
-- Status lifecycle:
--   pending  → verified  (guard marks arrival)
--   pending  → expired   (window closes; handled by app / cron)
--
-- RLS matrix:
--   admin/super_admin : full CRUD, own building
--   resident          : SELECT + INSERT own passes; DELETE only pending
--   guard             : SELECT all in building; UPDATE pending→verified only
--
-- Demo mode: RESTRICTIVE deny policies block INSERT/UPDATE/DELETE
-- for demo accounts (mirrors the pattern in 20260520120000_bms_demo_mode).
-- ============================================================

-- ─── 1. Table ─────────────────────────────────────────────────
CREATE TABLE public.bms_visitor_passes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id     uuid        NOT NULL REFERENCES public.bms_buildings(id)  ON DELETE CASCADE,
  resident_id     uuid        NOT NULL REFERENCES public.bms_residents(id)  ON DELETE CASCADE,
  plate_number    text        NOT NULL,         -- stored UPPERCASE, stripped by app layer
  visitor_name    text,                          -- optional: who is visiting
  expected_from   timestamptz NOT NULL,          -- start of allowed entry window
  expected_until  timestamptz NOT NULL,          -- end of window (pass auto-expires)
  notes           text,                          -- optional notes from resident
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'verified', 'expired')),
  verified_by     uuid        REFERENCES public.bms_profiles(id) ON DELETE SET NULL,
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- window sanity: end must be strictly after start
  CONSTRAINT bms_visitor_passes_window_check CHECK (expected_until > expected_from)
);

-- ─── 2. Indexes ───────────────────────────────────────────────

-- Guard: pending passes for tonight in this building (primary guard query)
CREATE INDEX bms_visitor_passes_building_status_idx
  ON public.bms_visitor_passes (building_id, status, expected_until);

-- Guard: plate search with pass lookup (used in vehicle search join)
CREATE INDEX bms_visitor_passes_plate_building_idx
  ON public.bms_visitor_passes (building_id, plate_number, status);

-- Resident: list own passes, newest first
CREATE INDEX bms_visitor_passes_resident_idx
  ON public.bms_visitor_passes (resident_id, created_at DESC);

-- ─── 3. RLS ───────────────────────────────────────────────────
ALTER TABLE public.bms_visitor_passes ENABLE ROW LEVEL SECURITY;

-- ── admin / super_admin: full access in their building ────────
DROP POLICY IF EXISTS bms_visitor_passes_admin_all ON public.bms_visitor_passes;
CREATE POLICY bms_visitor_passes_admin_all ON public.bms_visitor_passes
  FOR ALL TO authenticated
  USING (
    bms_current_role() IN ('admin', 'super_admin')
    AND building_id = bms_current_building()
  )
  WITH CHECK (
    bms_current_role() IN ('admin', 'super_admin')
    AND building_id = bms_current_building()
  );

-- ── resident: SELECT own passes ───────────────────────────────
DROP POLICY IF EXISTS bms_visitor_passes_resident_select ON public.bms_visitor_passes;
CREATE POLICY bms_visitor_passes_resident_select ON public.bms_visitor_passes
  FOR SELECT TO authenticated
  USING (
    bms_current_role() = 'resident'
    AND building_id = bms_current_building()
    AND resident_id IN (
      SELECT id FROM public.bms_residents
      WHERE profile_id = auth.uid()
        AND building_id = bms_current_building()
    )
  );

-- ── resident: INSERT own passes ───────────────────────────────
DROP POLICY IF EXISTS bms_visitor_passes_resident_insert ON public.bms_visitor_passes;
CREATE POLICY bms_visitor_passes_resident_insert ON public.bms_visitor_passes
  FOR INSERT TO authenticated
  WITH CHECK (
    bms_current_role() = 'resident'
    AND building_id = bms_current_building()
    AND resident_id IN (
      SELECT id FROM public.bms_residents
      WHERE profile_id = auth.uid()
        AND building_id = bms_current_building()
    )
  );

-- ── resident: DELETE own passes (pending only) ────────────────
-- Once a guard has verified a pass it becomes an immutable record;
-- residents may only retract passes that have not yet been acted on.
DROP POLICY IF EXISTS bms_visitor_passes_resident_delete ON public.bms_visitor_passes;
CREATE POLICY bms_visitor_passes_resident_delete ON public.bms_visitor_passes
  FOR DELETE TO authenticated
  USING (
    bms_current_role() = 'resident'
    AND building_id = bms_current_building()
    AND status = 'pending'
    AND resident_id IN (
      SELECT id FROM public.bms_residents
      WHERE profile_id = auth.uid()
        AND building_id = bms_current_building()
    )
  );

-- ── guard: SELECT all passes in building ──────────────────────
DROP POLICY IF EXISTS bms_visitor_passes_guard_select ON public.bms_visitor_passes;
CREATE POLICY bms_visitor_passes_guard_select ON public.bms_visitor_passes
  FOR SELECT TO authenticated
  USING (
    bms_current_role() = 'guard'
    AND building_id = bms_current_building()
  );

-- ── guard: UPDATE pending → verified only ─────────────────────
-- USING restricts which rows the guard may touch (only 'pending').
-- WITH CHECK restricts what the guard may write (only 'verified').
-- The application layer further enforces that only status, verified_by,
-- and verified_at fields change; all other fields remain untouched.
DROP POLICY IF EXISTS bms_visitor_passes_guard_update ON public.bms_visitor_passes;
CREATE POLICY bms_visitor_passes_guard_update ON public.bms_visitor_passes
  FOR UPDATE TO authenticated
  USING (
    bms_current_role() = 'guard'
    AND building_id = bms_current_building()
    AND status = 'pending'
  )
  WITH CHECK (
    bms_current_role() = 'guard'
    AND building_id = bms_current_building()
    AND status = 'verified'
  );

-- ─── 4. Demo mode — restrictive deny policies ─────────────────
-- Mirrors the exact pattern used in 20260520120000_bms_demo_mode.sql.
-- Three separate RESTRICTIVE policies (INSERT / UPDATE / DELETE) so
-- SELECT is intentionally left open — demo users can still browse
-- seeded demo passes.
DROP POLICY IF EXISTS bms_visitor_passes_demo_deny_ins ON public.bms_visitor_passes;
CREATE POLICY bms_visitor_passes_demo_deny_ins ON public.bms_visitor_passes
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.bms_is_demo_user());

DROP POLICY IF EXISTS bms_visitor_passes_demo_deny_upd ON public.bms_visitor_passes;
CREATE POLICY bms_visitor_passes_demo_deny_upd ON public.bms_visitor_passes
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.bms_is_demo_user())
  WITH CHECK (NOT public.bms_is_demo_user());

DROP POLICY IF EXISTS bms_visitor_passes_demo_deny_del ON public.bms_visitor_passes;
CREATE POLICY bms_visitor_passes_demo_deny_del ON public.bms_visitor_passes
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.bms_is_demo_user());
