-- Real collection-account details on bms_bank_accounts.
--
-- The table already held `name` (free text) and `account_number_masked`
-- (last 4 digits only, by design — that shape is for masking someone ELSE's
-- account). A society's own collection account is the opposite case: the
-- full number is printed on notices so residents know where to transfer.
-- Without it, "Paid into" could only ever say "Bank", which tells nobody
-- which account actually received the money.
--
-- `account_number_masked` is kept and still populated so nothing that reads
-- it breaks; new UI writes the full number and derives the mask.

alter table bms_bank_accounts
  add column if not exists bank_name      text,
  add column if not exists account_title  text,
  add column if not exists account_number text,
  add column if not exists iban           text;

comment on column bms_bank_accounts.bank_name is
  'Bank the account is held with, e.g. HBL, UBL, Meezan. NULL for cash accounts.';
comment on column bms_bank_accounts.account_title is
  'Title the account is held in, as printed on the cheque book.';
comment on column bms_bank_accounts.account_number is
  'Full account number. NOT sensitive — the society publishes it so residents can transfer.';
comment on column bms_bank_accounts.iban is
  'Optional IBAN, for residents transferring from another bank.';

-- Residents may read their own building's ACTIVE accounts, so the app can
-- show them where to pay. Deliberately scoped: active rows, own building.
-- Approved as non-sensitive — these details are published to residents
-- anyway. Write access is unchanged (bms_can_write_building only).
drop policy if exists bms_bank_accounts_resident_select on bms_bank_accounts;
create policy bms_bank_accounts_resident_select
  on bms_bank_accounts
  for select
  using (
    bms_current_role() = 'resident'
    and building_id = bms_current_building()
    and is_active
  );
