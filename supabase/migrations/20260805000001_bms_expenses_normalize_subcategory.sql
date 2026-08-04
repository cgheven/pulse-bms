-- bms_expenses.subcategory used two different values for "no subcategory":
-- NULL (8 rows) and '' (22 rows). Any group-by or filter on the head split
-- those into two separate buckets, and a "Not specified" filter would have
-- needed an OR across both — which collides with the OR already used by the
-- search clause on the expenses list.
--
-- Collapse to NULL, matching how vendor / receipt_url / bill_account_id
-- already represent "unset" on this table. app/actions/expenses.ts now
-- normalises '' -> NULL on write, so this is a one-time backfill.
update bms_expenses
set subcategory = null
where subcategory = '';
