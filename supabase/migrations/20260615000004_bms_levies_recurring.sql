-- Recurring levies: a 'template' row spawns one draft levy instance per month.
ALTER TABLE public.bms_levies ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.bms_levies ADD COLUMN parent_levy_id uuid REFERENCES public.bms_levies(id) ON DELETE CASCADE;
ALTER TABLE public.bms_levies ADD COLUMN billing_month date;

-- Allow the new 'template' status
ALTER TABLE public.bms_levies DROP CONSTRAINT IF EXISTS bms_levies_status_check;
ALTER TABLE public.bms_levies ADD CONSTRAINT bms_levies_status_check
  CHECK (status IN ('draft', 'distributed', 'cancelled', 'template'));

-- One instance per template per month (idempotent monthly generation + race guard)
CREATE UNIQUE INDEX bms_levies_parent_month_uniq
  ON public.bms_levies(parent_levy_id, billing_month)
  WHERE parent_levy_id IS NOT NULL;

CREATE INDEX bms_levies_parent_idx ON public.bms_levies(parent_levy_id);
