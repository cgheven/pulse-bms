-- Pulse BMS — Reports module composite indexes
--
-- The /admin/reports/* pages all filter by (building_id = X AND date BETWEEN
-- :from AND :to) and order by date desc. Without a composite index on
-- (building_id, date desc) Postgres falls back to a building-id-only index
-- scan + in-memory sort, which costs ~30k row reads + sort per page load at
-- ~5k payments per building. These indexes make the same query an index
-- range scan.

create index if not exists bms_payments_building_date_idx
  on public.bms_payments (building_id, payment_date desc);

create index if not exists bms_expenses_building_date_idx
  on public.bms_expenses (building_id, expense_date desc);

create index if not exists bms_salary_payments_building_date_idx
  on public.bms_salary_payments (building_id, payment_date desc);
