-- Undo the legacy group merge. Keep the payment-mode correction.
--
-- Migration 20260805000005 did two things to the ten historical spillover
-- rows: it corrected their `payment_mode` off `credit_carryforward` (right —
-- they are real cash and belong in the cash position), and it merged each into
-- its parent's payment group (wrong).
--
-- Wrong because those pairs were never one collection. Under the old code an
-- overpayment produced two rows and the trigger issued a receipt number for
-- each, so the committee's paper register genuinely records receipt 000172 for
-- Rs. 5,000 AND receipt 000173 for Rs. 1,000. Merging them left ten groups
-- holding two receipt numbers each, which breaks the invariant the rest of
-- this work depends on — and because lib/receipts.ts resolves any row of a
-- group to its anchor, opening receipt 000173 rendered "Receipt 000172,
-- Rs. 6,000". A number in the register became unprintable, and two list rows
-- rendered the same receipt.
--
-- Rewriting history to fit a new model is the wrong trade. Each legacy row
-- goes back to being its own single-row group, keeping the receipt number it
-- was issued under. The `reference_no` back-link that ties the pair together
-- is untouched and still tells anyone reading the ledger what happened.
--
-- Only rows that migration ...005 actually merged are affected: a non-anchor
-- row that still holds a receipt number can only have come from that backfill,
-- because the trigger has issued receipt numbers to anchors alone ever since.

update public.bms_payments
   set payment_group_id = id
 where payment_group_id <> id
   and receipt_no is not null;

-- Post-condition: no group may hold more than one receipt number.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad from (
    select payment_group_id
      from public.bms_payments
     group by payment_group_id
    having count(receipt_no) > 1
  ) t;

  if v_bad > 0 then
    raise exception 'Still % payment group(s) holding more than one receipt number', v_bad;
  end if;
end $$;
