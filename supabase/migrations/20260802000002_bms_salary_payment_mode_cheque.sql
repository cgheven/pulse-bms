-- Allow 'cheque' as a salary payment mode.
--
-- Both salary dialogs have always offered Cash / Bank Transfer / Cheque /
-- Online, but bms_salary_payments' check constraint only permitted
-- cash|bank|online — so picking Cheque (or Bank Transfer, which the action
-- now maps to 'bank') failed with a constraint violation. bms_payments has
-- allowed 'cheque' all along; this brings the two tables in line.
--
-- Widening only: every existing row (cash / bank) still satisfies the new
-- constraint, so this cannot fail on live data.

alter table public.bms_salary_payments
  drop constraint if exists bms_salary_payments_payment_mode_check;

alter table public.bms_salary_payments
  add constraint bms_salary_payments_payment_mode_check
  check (payment_mode = any (array['cash'::text, 'bank'::text, 'online'::text, 'cheque'::text]));

comment on constraint bms_salary_payments_payment_mode_check on public.bms_salary_payments is
  'Mirrors bms_payments minus credit_carryforward (not meaningful for salaries). UI sends bank_transfer; app/actions/staff.ts maps it to bank.';
