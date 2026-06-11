-- Per-building invoice due day (1–28).
-- Used by generateMonthlyInvoices to set due_date on new invoices instead of
-- the previously hardcoded 10th. Existing buildings default to 10 so nothing
-- changes until an admin explicitly updates the setting.

ALTER TABLE public.bms_buildings
  ADD COLUMN IF NOT EXISTS invoice_due_day smallint NOT NULL DEFAULT 10
  CONSTRAINT bms_buildings_invoice_due_day_range CHECK (invoice_due_day BETWEEN 1 AND 28);
