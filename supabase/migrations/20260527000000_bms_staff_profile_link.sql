-- ============================================================
-- Pulse BMS — Staff ↔ Auth Profile Link
--
-- Adds profile_id to bms_staff so that chowkidar (guard) staff
-- members can be linked to a guard auth account.  The link is
-- optional: NULL = no linked login account for this staff member.
--
-- ON DELETE SET NULL: deleting the auth user does NOT cascade-
-- delete the staff record — we keep payroll history intact.
--
-- No RLS changes required; bms_staff already carries admin-only
-- write policies set in the original schema migration.
-- ============================================================

-- ─── 1. Column ────────────────────────────────────────────────
ALTER TABLE public.bms_staff
  ADD COLUMN IF NOT EXISTS profile_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── 2. Index (sparse — most staff have no linked profile) ────
CREATE INDEX IF NOT EXISTS bms_staff_profile_id_idx
  ON public.bms_staff (profile_id)
  WHERE profile_id IS NOT NULL;
