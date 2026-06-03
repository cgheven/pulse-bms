-- Add payment_status to bms_utility_accounts
ALTER TABLE public.bms_utility_accounts
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unknown'
  CHECK (payment_status IN ('paid', 'unpaid', 'unknown'));

CREATE INDEX IF NOT EXISTS bms_utility_accounts_payment_status_idx
  ON public.bms_utility_accounts (building_id, payment_status);
