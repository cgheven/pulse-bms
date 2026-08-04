-- Split the `water_supply` expense head into three.
--
-- One head was carrying three unrelated things, because
-- PROVIDER_CATEGORY_TO_EXPENSE mapped every "water" provider — KW&SB line
-- supply AND private tankers — onto `water_supply`, and Lineman wages were
-- filed there too. Committees ask "what did the tanker cost this month" and
-- the head could not answer it:
--
--   water_supply (46 rows, Rs. 801,500)
--     -> water_tanker  24 rows  Rs. 652,000   private tanker purchases
--     -> lineman       21 rows  Rs. 109,500   Hill Park labour, not water
--     -> water_supply   1 row   Rs.  40,000   genuine line supply
--
-- Classification is by bill account nickname or description, both of which
-- name the thing explicitly. Verified before applying: the two rules select
-- 24 and 21 rows with ZERO overlap, leaving exactly 1 row untouched.
--
-- lib/bill-providers.ts now routes the `water_tanker` provider key straight
-- to the new head, so this backfill is one-time.

-- Tanker first. A row qualifies if it is booked against a bill account named
-- like a tanker, or its description says so.
update bms_expenses e
set subcategory = 'water_tanker'
where e.subcategory = 'water_supply'
  and (
    exists (
      select 1 from bms_bill_accounts ba
      where ba.id = e.bill_account_id
        and ba.nickname ilike '%tanker%'
    )
    or e.description ilike '%tanker%'
  );

-- Lineman is labour that happened to be filed under a water head. Runs after
-- the tanker rule; the two are disjoint, so order is belt-and-braces.
update bms_expenses
set subcategory = 'lineman'
where subcategory = 'water_supply'
  and description ilike '%lineman%';
