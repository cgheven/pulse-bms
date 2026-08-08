-- Payment groups: one physical collection, many allocation rows.
--
-- A resident who hands over six months of maintenance in one go produces one
-- receipt in the real world but several rows here — one per invoice the money
-- settles. Until now those rows had nothing tying them together, which is why:
--   * the receipt printed only the first chunk's amount,
--   * deleting the collection reversed only one chunk, and
--   * the surplus that couldn't reach an invoice vanished from the cash
--     position until someone pressed "Generate invoices" months later.
--
-- `payment_group_id` is that tie. Convention: the group id IS the anchor row's
-- own id, so `payment_group_id = id` identifies the anchor and no extra column
-- is needed to find it.
--
-- See docs/advance-payment-plan.md for the full model.

-- ── 1. Columns ──────────────────────────────────────────────────────────
alter table public.bms_payments
  add column if not exists payment_group_id uuid;

comment on column public.bms_payments.payment_group_id is
  'Groups every allocation row produced by ONE physical collection. Equals the anchor row''s id; the anchor satisfies payment_group_id = id. Rows in a group share payment_date, payment_mode and bank_account_id, and their amounts sum to the money handed over.';

-- Provenance for invoices this system created on the resident's behalf when
-- they paid months ahead. Needed so reversing the collection can remove
-- exactly the invoices it created and nothing else.
alter table public.bms_invoices
  add column if not exists created_by_payment_group uuid;

comment on column public.bms_invoices.created_by_payment_group is
  'Set when this invoice was created up-front by an advance payment rather than by monthly generation. Lets a reversal delete exactly the invoices that collection created.';

-- ── 2. Backfill: legacy spillover pairs ─────────────────────────────────
-- Before this migration, the surplus of an overpayment was written as a
-- sibling row with payment_mode = 'credit_carryforward' and a note pointing at
-- the parent receipt. Those rows are REAL CASH — the resident handed the money
-- over on the parent's payment_date — so they must (a) join the parent's group
-- and (b) stop wearing a mode that from now on means "internal reallocation,
-- not new cash" (see migration 20260805000008, which excludes that mode from
-- the cash position).
--
-- Measured before applying: 10 such rows, all 1:1 with their parent, all
-- sharing the parent's payment_date and bank_account_id, all parent
-- payment_mode = 'cash'. The join is on reference_no::int = parent.receipt_no
-- and is guarded so a non-numeric reference can never be cast.
--
-- Only the MODE is corrected. These rows are deliberately NOT merged into
-- their parent's group: the old code issued each of them its own receipt
-- number, so the committee's paper register really does record two receipts
-- for that overpayment. Grouping them would leave one group holding two
-- receipt numbers and make one of them unprintable — rewriting the register
-- to fit a newer model. The reference_no back-link already records the
-- relationship for anyone reading the ledger.
update public.bms_payments c
   set payment_mode = p.payment_mode
  from public.bms_payments p
 where p.building_id = c.building_id
   and p.receipt_no  = c.reference_no::int
   and c.payment_mode = 'credit_carryforward'
   and c.notes like 'Carry-forward from receipt %'
   and c.reference_no ~ '^[0-9]+$';

-- ── 3. Backfill: everything else is its own group ───────────────────────
-- Every historical payment stands alone, so each becomes a single-row group
-- anchored on itself. This keeps the receipt/reversal code free of null
-- handling — there is no such thing as an ungrouped payment after this.
update public.bms_payments
   set payment_group_id = id
 where payment_group_id is null;

alter table public.bms_payments
  alter column payment_group_id set default gen_random_uuid();

alter table public.bms_payments
  alter column payment_group_id set not null;

-- ── 4. Indexes ──────────────────────────────────────────────────────────
-- Hot path: load every row of a group to render one receipt, and reverse a
-- group on delete. building_id leads so the index is usable under RLS scoping.
create index if not exists bms_payments_group_idx
  on public.bms_payments (building_id, payment_group_id);

-- Hot path: find the invoices a given collection created, for reversal.
create index if not exists bms_invoices_created_by_group_idx
  on public.bms_invoices (created_by_payment_group)
  where created_by_payment_group is not null;

-- Hot path for the allocation waterfall: walk a flat's open invoices in
-- billing_month order, both backwards (arrears) and forwards (spill).
-- Flagged as a TODO in app/actions/payments.ts; making it real here.
create index if not exists bms_invoices_flat_month_status_idx
  on public.bms_invoices (building_id, flat_id, billing_month, status);
