-- Unique constraint: prevents double-distribution race condition
ALTER TABLE public.bms_levy_charges
  ADD CONSTRAINT bms_levy_charges_levy_resident_unique
  UNIQUE (levy_id, resident_id);

-- updated_at trigger (matches bms_touch_updated_at from migration 001)
CREATE TRIGGER bms_levies_touch
  BEFORE UPDATE ON public.bms_levies
  FOR EACH ROW EXECUTE FUNCTION public.bms_touch_updated_at();

-- Composite indexes for query performance
CREATE INDEX bms_levy_charges_levy_status_idx
  ON public.bms_levy_charges(levy_id, status, created_at);

CREATE INDEX bms_levy_charges_resident_due_idx
  ON public.bms_levy_charges(resident_id, due_date DESC);
