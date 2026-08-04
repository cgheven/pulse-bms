-- Societies collect in exactly two ways: cash, or into a bank account.
-- "Transfer" and "online" are the same event from the society's point of
-- view (money lands in the bank), and nobody pays maintenance by cheque.
--
-- The old CHECK allowed cash|bank|online|cheque|credit_carryforward and the
-- form offered five options, three of which never legitimately occur. Fold
-- them into `bank` and stop accepting them.
--
-- `credit_carryforward` stays: it is written by billing.ts when an
-- overpayment is auto-applied to the next invoice. It is never user-selected
-- and must remain a legal value.

-- Existing rows: 1 `online`, 0 `cheque` (measured before applying).
update bms_payments
set payment_mode = 'bank'
where payment_mode in ('online', 'cheque');

alter table bms_payments
  drop constraint if exists bms_payments_payment_mode_check;

alter table bms_payments
  add constraint bms_payments_payment_mode_check
  check (payment_mode = any (array['cash'::text, 'bank'::text, 'credit_carryforward'::text]));
