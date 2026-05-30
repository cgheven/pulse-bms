-- ============================================================
-- BMS: Accountant role
-- ============================================================
-- Introduces a new restricted role `accountant` whose surface covers
-- financial reporting and payment recording for a single building.
-- An accountant is scoped to a single building via building_id on their profile.
--
-- What an accountant CAN do:
--   * INSERT bms_payments   — record maintenance payments on behalf of residents
--   * SELECT bms_payments   — view payment history for reports
--   * SELECT bms_invoices   — view invoices / maintenance dues
--   * SELECT bms_flats      — flat_number display on maintenance page
--   * SELECT bms_residents  — resident names on maintenance page / payment records
--   * SELECT bms_expenses   — view expenses for expense report
--   * SELECT bms_bank_accounts — view bank/cash accounts for cash position report
--   * SELECT bms_buildings  — own building name display in UI headers
--
-- What an accountant CANNOT do:
--   * INSERT / UPDATE / DELETE invoices, flats, residents, staff, expenses,
--     facilities, or any other mutating operation not listed above
--   * Access bms_staff, bms_attendance, bms_salary_payments, bms_proposals,
--     bms_complaints, bms_notices, bms_vehicles, bms_audit_log, or any
--     table not explicitly listed above (RLS deny-by-default covers this)
--
-- Changes:
--   1. Extend bms_profiles.role CHECK to allow 'accountant'.
--   2. Add SELECT policy on bms_payments for accountant.
--   3. Add INSERT policy on bms_payments for accountant.
--   4. Add SELECT policy on bms_invoices for accountant.
--   5. Add SELECT policy on bms_flats for accountant.
--   6. Add SELECT policy on bms_residents for accountant.
--   7. Add SELECT policy on bms_expenses for accountant.
--   8. Add SELECT policy on bms_bank_accounts for accountant.
--   9. Add SELECT policy on bms_buildings for accountant.
-- ============================================================

-- ─── 1. Extend role CHECK to allow 'accountant' ──────────────────────────────
-- Drop the current constraint (set by the guard-role migration) and recreate it
-- with 'accountant' appended. Idempotent: the constraint name is stable.
alter table public.bms_profiles
  drop constraint if exists bms_profiles_role_check;

alter table public.bms_profiles
  add constraint bms_profiles_role_check
  check (role in ('super_admin', 'admin', 'union', 'resident', 'sales', 'guard', 'accountant'));

-- ─── 2. bms_payments — accountant SELECT ─────────────────────────────────────
-- Accountant can read all payment records in their building for reporting.
drop policy if exists bms_payments_accountant_select on public.bms_payments;
create policy bms_payments_accountant_select on public.bms_payments
  for select to authenticated
  using (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  );

-- ─── 3. bms_payments — accountant INSERT ─────────────────────────────────────
-- Accountant can record new payments (e.g. cash received at counter).
-- The building_id on the new row must match the accountant's own building so
-- they cannot insert payments for other buildings.
drop policy if exists bms_payments_accountant_insert on public.bms_payments;
create policy bms_payments_accountant_insert on public.bms_payments
  for insert to authenticated
  with check (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  );

-- ─── 4. bms_invoices — accountant SELECT ─────────────────────────────────────
-- Accountant can view all invoices in their building to cross-reference
-- outstanding dues and match payments to invoices.
drop policy if exists bms_invoices_accountant_select on public.bms_invoices;
create policy bms_invoices_accountant_select on public.bms_invoices
  for select to authenticated
  using (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  );

-- ─── 5. bms_flats — accountant SELECT ────────────────────────────────────────
-- Accountant needs flat_number to display on the maintenance / payment pages
-- (e.g. "Flat 3B — Rs. 5,000 paid").
drop policy if exists bms_flats_accountant_select on public.bms_flats;
create policy bms_flats_accountant_select on public.bms_flats
  for select to authenticated
  using (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  );

-- ─── 6. bms_residents — accountant SELECT ────────────────────────────────────
-- Accountant may read resident names to identify payers on the maintenance and
-- payment record pages. Sensitive fields (CNIC, phone) are enforced at the
-- application layer; this policy limits the accountant to their own building.
drop policy if exists bms_residents_accountant_select on public.bms_residents;
create policy bms_residents_accountant_select on public.bms_residents
  for select to authenticated
  using (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  );

-- ─── 7. bms_expenses — accountant SELECT ─────────────────────────────────────
-- Accountant can view expense records in their building for the expense report
-- and overall cash-flow view. They cannot insert, update, or delete expenses.
drop policy if exists bms_expenses_accountant_select on public.bms_expenses;
create policy bms_expenses_accountant_select on public.bms_expenses
  for select to authenticated
  using (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  );

-- ─── 8. bms_bank_accounts — accountant SELECT ────────────────────────────────
-- Accountant can view bank/cash account balances for the cash position report.
-- They cannot modify account records.
drop policy if exists bms_bank_accounts_accountant_select on public.bms_bank_accounts;
create policy bms_bank_accounts_accountant_select on public.bms_bank_accounts
  for select to authenticated
  using (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  );

-- ─── 9. bms_buildings — accountant SELECT ────────────────────────────────────
-- Accountant can read their own building row so the UI can display the building
-- name in headers and reports. Scoped strictly to their own building_id.
drop policy if exists bms_buildings_accountant_select on public.bms_buildings;
create policy bms_buildings_accountant_select on public.bms_buildings
  for select to authenticated
  using (
    bms_current_role() = 'accountant'
    and id = bms_current_building()
  );

-- ─── 10. bms_profiles — accountant SELECT (building-scoped) ──────────────────
-- The session bootstrap (requireRole / requireBuilding in lib/auth.ts) reads
-- the caller's own bms_profiles row via the service-role client (RLS bypass).
-- However, the maintenance/page.tsx loadPaymentsData() query at line 517 uses
-- the regular user client to JOIN bms_profiles on recorded_by UUIDs to show
-- "Recorded by" names in the Payments tab. Without this policy that query
-- returns empty and every recorder column shows blank.
drop policy if exists bms_profiles_accountant_select on public.bms_profiles;
create policy bms_profiles_accountant_select on public.bms_profiles
  for select to authenticated
  using (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  );

-- ─── 11. bms_invoices — accountant UPDATE ────────────────────────────────────
-- recordPayment calls refreshInvoiceStatus() which issues an UPDATE on
-- bms_invoices to set status = 'paid'|'partial'|'pending'. Without this policy
-- the UPDATE silently no-ops under RLS when an accountant records a payment,
-- leaving invoices stuck in 'pending' and corrupting collected KPIs.
drop policy if exists bms_invoices_accountant_update on public.bms_invoices;
create policy bms_invoices_accountant_update on public.bms_invoices
  for update to authenticated
  using (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  )
  with check (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  );

-- ─── 12. bms_flats — accountant UPDATE ───────────────────────────────────────
-- recordPayment decrements bms_flats.outstanding_dues after each payment
-- (payments.ts line 431–436). Without an UPDATE policy the decrement is a
-- silent no-op and the defaulters panel / flat dues display shows inflated
-- balances even after the accountant has recorded a payment.
drop policy if exists bms_flats_accountant_update on public.bms_flats;
create policy bms_flats_accountant_update on public.bms_flats
  for update to authenticated
  using (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  )
  with check (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  );

-- ─── 13. bms_flat_credits — accountant SELECT + INSERT ───────────────────────
-- When a payment exceeds the invoice amount (overpayment), recordPayment
-- INSERTs the surplus into bms_flat_credits (payments.ts line 390). Without
-- these policies the INSERT silently no-ops under RLS and the resident's
-- credit is lost (money accepted but not parked as credit).
-- SELECT is also needed so the action can read existing credits on line 119–125
-- to apply carry-forward credits against new invoices.
drop policy if exists bms_flat_credits_accountant_select on public.bms_flat_credits;
create policy bms_flat_credits_accountant_select on public.bms_flat_credits
  for select to authenticated
  using (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  );

drop policy if exists bms_flat_credits_accountant_insert on public.bms_flat_credits;
create policy bms_flat_credits_accountant_insert on public.bms_flat_credits
  for insert to authenticated
  with check (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  );

-- ─── 14. bms_residents — accountant UPDATE (entry_fee) ───────────────────────
-- recordPayment updates bms_residents.entry_fee_paid when category = 'entry_fee'
-- (payments.ts lines 448–453). Without an UPDATE policy this silently no-ops
-- and entry_fee_paid remains false even after the accountant records the payment.
-- Scope: same building only. Accountants cannot create or delete residents.
drop policy if exists bms_residents_accountant_update on public.bms_residents;
create policy bms_residents_accountant_update on public.bms_residents
  for update to authenticated
  using (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  )
  with check (
    bms_current_role() = 'accountant'
    and building_id = bms_current_building()
  );
