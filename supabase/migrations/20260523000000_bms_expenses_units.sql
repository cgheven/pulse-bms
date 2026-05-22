-- ============================================================
-- Pulse BMS — Units consumed on bms_expenses
--
-- PK utility bills (KE, SSGC, water) print units consumed on each
-- monthly challan. Committees + auditors want to spot anomalies
-- ("Block A used 4500 kWh this month vs 3200 last month — leak?").
--
-- Nullable: only populated when is_bill=true AND the linked bill
-- account's provider category supports units (electricity / gas /
-- water — internet, mobile, lift AMC, security AMC do not).
--
-- numeric(14,3) — big readings (gas/water cumulative) + 3 decimals
-- for fractional units some KE/SSGC challans report.
--
-- No new RLS: the column lives on bms_expenses and inherits existing
-- policies (admin/super_admin write scoped to building, union+resident
-- read scoped to building, restrictive demo deny on writes).
-- ============================================================

alter table public.bms_expenses
  add column if not exists units_consumed numeric(14,3);

-- Optional sanity guard: units_consumed must be >= 0 when set. The
-- column is nullable so unset rows skip the check. Mirrors the
-- application-layer validation in app/actions/expenses.ts and keeps
-- the DB honest if a future caller bypasses the action.
alter table public.bms_expenses
  drop constraint if exists bms_expenses_units_consumed_nonneg;
alter table public.bms_expenses
  add constraint bms_expenses_units_consumed_nonneg
  check (units_consumed is null or units_consumed >= 0);
