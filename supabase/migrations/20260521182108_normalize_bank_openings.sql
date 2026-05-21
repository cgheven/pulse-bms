-- Normalize per-bank opening balances to 0.
-- Society-wide opening is the canonical source (bms_buildings.opening_balance);
-- per-bank openings are no longer user-editable. Zero out any historical
-- non-zero values to prevent double-counting in the "All combined" reports
-- view. Idempotent: safe to re-run.
update public.bms_bank_accounts set opening_balance = 0 where opening_balance != 0;
