# Advance Payment — Design Plan

**Status:** planning → implementation
**Date:** 2026-08-05
**Scenario:** a resident hands over Rs. 30,000 in August against a Rs. 5,000/month
maintenance bill — six months paid up front (Aug 2026 → Jan 2027).

---

## 1. What happens today (verified against code + live DB)

`recordPayment` (`app/actions/payments.ts`) caps the payment row at the invoice's
remaining capacity and routes the surplus. Which route it takes depends on
something the recorder has no reason to think about — whether next month's
invoices have been generated yet.

**Path A — future invoices already exist.** The Rs. 30,000 is capped to Rs. 5,000
on the August invoice, then spilled forward one invoice at a time
(`payments.ts:340-408`), each spill row written with
`payment_mode = 'credit_carryforward'`. Six invoices flip to paid. Live data
already contains this shape: flat B-8 has receipts 173/175/177/179/181
back-linked to 172/174/176/178/180.

**Path B — they don't (the normal case, generation is a manual button).** The
August row is capped to Rs. 5,000 and Rs. 25,000 is parked in
`bms_flat_credits`. Each month someone presses "Generate invoices",
FIFO burns Rs. 5,000 off the credit (`billing.ts:120-199`).
`outstanding_dues` sits at −25,000.

The underlying ledger idea is sound. The problems are around it.

---

## 2. Defects this feature must fix

| # | Defect | Evidence |
|---|---|---|
| **D1** | **Receipt understates what was handed over.** The anchor row is capped (`payments.ts:308-312`) and `loadReceiptData` prints `payment.amount`. Best case the collection is spread over six separate receipt numbers; worst case one Rs. 5,000 receipt exists and Rs. 25,000 has no receipt at all. | `lib/receipts.ts:128` |
| **D2** | **`deletePayment` corrupts the ledger.** Dues were reduced by the full Rs. 30,000 (`payments.ts:457`); delete adds back only the capped Rs. 5,000 (`payments.ts:559`). Spillover rows and the credit row survive as orphans (`source_payment_id` is `on delete set null`). | code |
| **D3** | **Overflow never settles arrears.** The forward walk is `.gt("billing_month", …)` (`payments.ts:345`). A flat with June unpaid pre-pays Sept–Jan while staying a defaulter for June. | code |
| **D4** | **Cash position is wrong on Path B.** Rs. 30,000 physically arrived in August but only Rs. 5,000 is a payment row, so `getCashTotals` under-reports August by Rs. 25,000. The money then reappears month by month as credit-burn rows dated the day the invoice was generated (`billing.ts:147`), not August. Bank reconciliation cannot balance. | `lib/finance-totals.ts:81`, RPC `bms_building_cash_totals` |
| **D5** | **The concurrency guard is a no-op.** `bms_record_payment_with_lock` takes `pg_advisory_xact_lock`, which releases at transaction end. PostgREST runs **every HTTP request in its own transaction**, so the lock is gone before the first insert. The comment at `payments.ts:207-219` asserting otherwise is factually wrong. | RPC source + PostgREST semantics |
| **D6** | **The whole collection is non-atomic.** One advance is ~15 sequential HTTP round trips with no transaction. A drop mid-way leaves invoices created and unpaid, or dues decremented with no payment row. | code |
| **D7** | **Nobody can see "paid through January".** Admin sees `outstanding_dues: −25,000`; resident sees a rupee credit figure. Neither answers the actual question. | UI |
| **D8** | **Credit-burn rows carry no `bank_account_id`** (`billing.ts:142-153`), so money that was banked in August lands in the "cash in hand" bucket of the Day Book months later. | code |

---

## 3. Target model

### 3.1 One principle

> A `bms_payments` row is an **allocation of a real cash receipt**.
> Every row produced by one physical collection shares a `payment_group_id`,
> the same `payment_date`, the same `payment_mode` and the same
> `bank_account_id`, and their amounts sum to the money handed over.

Consequences, all of which we want:

- The cash/bank position is right **on the day the money arrived** (fixes D4).
- `sum(payments where invoice_id = X)` stays the invoice-level truth — no change
  to the 39 files that read `bms_payments`.
- One collection → one receipt (fixes D1).
- One collection → one reversible unit (fixes D2).

`credit_carryforward` is **retired**. It used to mark a second payment row
invented when a stored credit was consumed — which, once the advance itself is a
real payment row, would be the same rupees counted twice in every report that
sums `bms_payments`.

The first draft of this plan proposed excluding that mode from the cash-total
RPCs. That was the wrong fix: it would have left ~39 files each needing to
remember to filter one payment mode, and any that forgot would silently
over-state income. Instead, consuming an advance **re-attaches the payment row
that already holds the money** to the invoice it now pays for, splitting the row
when the invoice is smaller. No row is created, no rupee moves, and no report
needs to know anything happened — so no totals code changed at all.

Legacy spillover rows wearing `credit_carryforward` are real cash and get
migrated to their parent's real mode.

### 3.2 The allocation waterfall

Given amount `A` on flat `F`, anchored at invoice `I`:

1. **Arrears** — open invoices with `billing_month < I.billing_month`, oldest
   first. *(fixes D3)*
2. **Anchor** — invoice `I`.
3. **Forward** — open invoices with `billing_month > I.billing_month`,
   chronological. *(existing behaviour)*
4. **New months** — if the recorder confirmed advance months, create invoices for
   successive months at the flat's current fee and settle each.
5. **Residual** — anything below one month's fee becomes a payment row with
   `invoice_id = null` (so the cash is still counted, dated correctly, attached
   to the right bank account) **plus** a `bms_flat_credits` row pointing at it.

Step 4 is what makes the feature work: the six months become real invoices, so
"paid through January" is simply true, `generateMonthlyInvoices` skips them
(`existingSet`, `billing.ts:57`), and nothing depends on an admin remembering to
press a button.

### 3.3 Dues semantics (simplified, and now always ≥ 0)

| Event | `outstanding_dues` |
|---|---|
| Invoice created | `+= amount` |
| Payment row allocated to an invoice (any mode) | `-= amount` |
| Residual advance (`invoice_id = null`) | unchanged |

So `outstanding_dues == sum of unpaid portions of existing invoices`. It never
goes negative. "Advance held" becomes a separate positive number (open credits),
which is what a resident actually understands.

This makes the `billing.ts:188-198` comment obsolete — credit burn must now
decrement dues. Safe to change: the live DB has **0 credit rows and 0 flats with
negative dues**, so there is no legacy state to preserve.

### 3.4 Atomicity

Steps 1–5 plus dues and status updates move into one `SECURITY DEFINER` plpgsql
function, `bms_record_payment_allocated`. One transaction, one genuinely-held
advisory lock (fixes D5 and D6). `SECURITY DEFINER` is required because the
`union` role can insert payments but has **no INSERT policy on `bms_invoices`** —
so the function must re-implement, explicitly, every check RLS would have done:
caller identity, role, building write access, demo user, expired trial.

---

## 4. Edge cases

### Money and arithmetic
| | Case | Handling |
|---|---|---|
| E1 | Amount equals the invoice exactly | Unchanged single-row behaviour |
| E2 | Amount less than due | Partial, unchanged |
| E3 | Amount ≤ 0 | Rejected (existing guard, re-asserted in SQL) |
| E4 | Fractional rupees (Rs. 5,000.50) | All maths in `numeric(12,2)`; residual takes the remainder so no paisa is lost |
| E5 | Absurd amount (Rs. 3,000,000 → 600 months) | Advance months hard-capped at **24**; the rest becomes a credit |
| E6 | `flats.monthly_fee` is NULL | Fall back to `buildings.monthly_fee_default`; still null → no advance months |
| E7 | Fee is 0 or negative | No advance months (would loop forever); residual → credit |
| E8 | Residual below one month (Rs. 32,000) | 6 invoices + Rs. 2,000 credit |

### Invoice state
| | Case | Handling |
|---|---|---|
| E9 | Future invoices already exist, pending | Consumed in step 3 — never duplicated |
| E10 | Future invoice already paid | Capacity 0, skipped |
| E11 | Future invoice waived | Skipped; never resurrected |
| E12 | Future invoice partially paid | Fill remaining capacity only |
| E13 | Month collides with the unique index `(building_id, flat_id, billing_month)` | Impossible by construction under the lock; function still uses `on conflict do nothing` + re-select as a backstop |
| E14 | Arrears exist | Settled **before** the anchor — deliberate behaviour change |
| E15 | Anchor invoice is waived | Rejected |
| E16 | Anchor invoice belongs to another flat or building | Rejected |

### Flat state
| | Case | Handling |
|---|---|---|
| E17 | Vacant flat | No advance months (mirrors `billing.ts:70`); residual → credit |
| E18 | Flat deleted mid-flight | Lock + FK `on delete restrict` on credits |
| E19 | Flat in another building | Rejected |

### Payment metadata
| | Case | Handling |
|---|---|---|
| E20 | Back-dated payment (August cash entered in September) | Every group row carries the same back-dated date — cash lands in August |
| E21 | Future-dated payment | Allowed, consistent across the group |
| E22 | Cash in hand (`bank_account_id` null) | Null on every row |
| E23 | Bank account from another building | Rejected inside the RPC |
| E24 | Transaction ID / reference | Written to every row (one transaction covers the collection); receipt shows it once |

### Category
| | Case | Handling |
|---|---|---|
| E25 | `entry_fee` / `fine` / `other` | No waterfall — these have no invoice |
| E26 | `project` | Untouched; `project_id` stamped, `invoice_id` null |

### Roles and security
| | Case | Handling |
|---|---|---|
| E27 | `union` can insert payments but **cannot** insert invoices | RPC is `SECURITY DEFINER` and authorises explicitly |
| E28 | `accountant` — payments insert + invoice update, no invoice insert | Same treatment |
| E29 | Demo user | Restrictive deny policies are bypassed by DEFINER → `bms_is_demo_user()` re-checked in the function |
| E30 | Expired trial | `bms_invoices_trial_block` bypassed by DEFINER → re-checked in the function |
| E31 | `super_admin` on any building | Allowed; receiver snapshot null |
| E32 | Multi-building admin | Access decided by `bms_can_write_building`, which already covers `bms_admin_buildings` |
| E33 | Caller forges `p_building_id` | Argument is never trusted — write access is verified for that exact building |
| E34 | `auth.uid()` null | Rejected |

### Concurrency and failure
| | Case | Handling |
|---|---|---|
| E35 | Two recorders, same flat | Advisory lock now held for the real transaction |
| E36 | Connection drops mid-allocation | Single transaction — all or nothing |
| E37 | Receipt-number allocation under load | Existing trigger locks the building row; unchanged |
| E38 | Advance races monthly generation | Unique index + `on conflict do nothing` on both sides |

### Deletion and reversal
| | Case | Handling |
|---|---|---|
| E39 | Delete the anchor | Whole group reversed atomically |
| E40 | Delete a child row | Also reverses the whole group — a child is not an independent payment |
| E41 | Auto-created invoices | Deleted only if created by this group **and** carrying no other payments |
| E42 | Credit from the group already consumed by a later invoice | **Deletion refused** with a clear message — cascading into an already-settled later month is worse than making the user reverse it explicitly |
| E43 | Fee changed since the payment | Reversal uses recorded amounts, never the current fee |
| E44 | Double delete | Idempotent no-op |

### Reporting
| | Case | Handling |
|---|---|---|
| E45 | Day Book | Six rows, same date, same account — they sum correctly; grouped label added |
| E46 | Collection-by-month | Six invoice-months against one payment-month; both are valid views, labels must say which |
| E47 | Existing totals must not shift | Migration verified by comparing whole-table sums before and after |
| E48 | Per-bank-account split | Every group row carries the same account, so no split |

### Fee changes
| | Case | Handling |
|---|---|---|
| E49 | Fee rises mid-advance | Advance months were invoiced at the old rate and are honoured — the standard society practice |
| E50 | Fee falls mid-advance | Same; no automatic refund |

### Resident-facing
| | Case | Handling |
|---|---|---|
| E51 | Resident view | "Paid through Jan 2027" + advance held, instead of a negative number |
| E52 | Statement download | Group rows listed individually, total unaffected |

---

## 5. What shipped

| Migration | Contents |
|---|---|
| `20260805000005` | `bms_payments.payment_group_id`, `bms_invoices.created_by_payment_group`, backfill, indexes |
| `20260805000006` | `bms_recalc_flat_dues` + `bms_record_payment_allocated` (the waterfall, atomic) |
| `20260805000007` | Receipt numbers issued per collection, not per row |
| `20260805000008` | `bms_delete_payment_group` (atomic reversal) |
| `20260805000009` | `bms_apply_flat_credits` (re-attach, never re-issue) |

Application changes: `recordPayment` / `deletePayment` delegate to the RPCs;
`billing.ts` drops its hand-rolled credit burn and dues arithmetic;
`waiveInvoice` / `deleteInvoice` recompute dues instead of nudging them;
`loadReceiptData` resolves the whole collection; `ReceiptCard` and the PDF
render one line per month; Record Payment offers to bill the months ahead;
`lib/paid-through.ts` powers "Paid through" on the flat page and resident dues.

### Two decisions worth recording

**`outstanding_dues` is recomputed, not adjusted.** Every previous code path
nudged it by a delta, so each slip became permanent — 11 of 310 flats had
drifted by up to Rs. 5,000 (net −Rs. 2,500 across the estate). Recomputing from
the invoices costs one cheap query and is self-healing. A flat's stored figure
is corrected the first time it is touched, which means totals will move slightly
on those 11 flats as they are.

**Receipt numbers are issued per collection.** Previously a six-month advance
consumed six numbers, five of which no resident ever received — the paper
register would look tampered with. Only the group anchor now takes a number.

## 6. Review findings and what changed because of them

Two independent reviews ran against the live database. Both found real defects;
everything below was fixed and re-tested.

### Security review — initial verdict DO NOT SHIP

The RPCs themselves held under every cross-tenant and privilege attack. What
did not hold was the assumption that they were the only way in.

| | Finding | Fix |
|---|---|---|
| H1 | `union`/`accountant` can INSERT into `bms_payments` directly, so `recorded_by` and the `received_by_*` snapshot were forgeable. An officer could pocket cash and print a receipt naming the president as having taken it. | Identity is pinned in the BEFORE INSERT trigger for every authenticated caller, whatever path they use. Non-anchor rows inherit the collector from their anchor so a credit split doesn't restamp history. |
| H2 | `receipt_no` is int4 and a caller-supplied value was honoured. Inserting `2147483647` made every later payment in that building fail `22003` forever. | Only an unauthenticated context (service_role, i.e. imports) may supply one, and it is bounded. |
| H3 | `bms_recalc_flat_dues` was the only one of the four with no demo or trial guard, and `bms_flats` protects those with RESTRICTIVE policies that SECURITY DEFINER bypasses. Chained with H1 it zeroed a flat's dues. | Split into `_unchecked` (no grants, callable only by the sibling RPCs after they authorise) and a fully guarded public wrapper. |
| L4–L7 | `bms_apply_flat_credits` didn't scope the source payment by `flat_id`; `anon` held EXECUTE on all four; the obsolete `bms_record_payment_with_lock` was still deployed as an unauthenticated cross-tenant existence oracle; `p_payment_date` was unbounded. | All four fixed; the legacy function dropped. |

### Lead code review — six confirmed defects

| | Finding | Fix |
|---|---|---|
| C1 | **The month-walk skipped months.** `v_month` seeded from `max(billing_month)` over *all* invoices, including paid and waived, so any unbilled month between the anchor and that max was jumped. A flat billed Jan–Jun plus a stray Sep, paying eight months ahead, never got July or August — and the next generation would bill them again to someone who had already paid. Nine live flats have that shape. | Seed from the anchor; the existing skip-guard steps over months that exist. |
| C2 | **The E42 refusal was an unrecoverable dead end.** It told the operator to "reverse that invoice first" — an operation nothing in the system can perform. A mistyped payment became permanently unfixable once the next month was generated. | Refusal removed. Consumed advances stay inside the group, so the reversal already handled them; affected months revert to unpaid and are reported in `reopened_invoices`. |
| C3 | The legacy backfill merged 10 historical pairs into single groups but left both receipt numbers, so one number in the paper register became unprintable and two rows rendered the same receipt. | Legacy rows stay their own single-row groups, keeping the receipts actually issued. Only the payment-mode correction was ever needed. |
| C4 | The dialog sized months ahead from the newest open invoice, not the flat's fee — wrong whenever the fee had changed since. | Reads `bms_flats.monthly_fee`, the same source the server uses. |
| C5 | The dialog offered to bill vacant flats ahead; the server silently refuses and parks it all as credit. | Checkbox suppressed for vacant flats. |
| C6 | Above 8 lines the receipt collapsed the "Held on account" row into the month range: "August 2026 – Held on account (25 months)". | Only real months collapse; the advance line stands alone. |

Also fixed from the review's lower-severity list: the recorder's own note is no
longer overwritten when an advance is applied, and the dialog's month labels are
built from explicit year/month numbers rather than UTC-parsed date strings,
which shifted them a month for viewers west of Greenwich.

## 7. Verification

17 cases exercised against the live database, each in a rolled-back
transaction: E3, E4, E5, E11, E15, E16, E17, E20, E24, E27, E29, E30, E33, E40,
E42, anonymous callers, and the resident role. Plus the three scenario tests —
a Rs. 50,000 six-month advance, a full record-then-reverse round trip, and the
hold-then-consume credit lifecycle — all asserting that cash totals move by
exactly the amount handed over and by nothing else.

## 8. Out of scope

- Automatic monthly invoice generation (cron). Worth doing, but the advance
  feature no longer depends on it once step 4 creates the months up front.
- Refunds of unused advance when a resident moves out.
- Pro-rata / partial-month billing.
