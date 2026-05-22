-- BMS: bill due date
--
-- Adds a nullable `due_date` to bms_expenses. Set only when the row is
-- a utility bill (is_bill=true); compared against expense_date in the
-- app to flag late payments and surface overdue badges in reports.

alter table public.bms_expenses
  add column if not exists due_date date;

comment on column public.bms_expenses.due_date is
  'Bill due date as printed on the challan. Nullable — only set for bill rows (is_bill=true). Used to flag late payments vs expense_date.';
