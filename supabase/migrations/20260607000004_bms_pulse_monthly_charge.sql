ALTER TABLE bms_buildings
  ADD COLUMN IF NOT EXISTS pulse_monthly_charge NUMERIC(12,2) DEFAULT NULL;

COMMENT ON COLUMN bms_buildings.pulse_monthly_charge IS
  'Monthly SaaS fee (PKR) that Pulse BMS charges this client. NULL = not set. Separate from monthly_fee_default (what residents pay).';
