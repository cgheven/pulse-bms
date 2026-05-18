# Pulse BMS — Product Roadmap & Feature Gap Register

> Living document. Source of truth for what's missing, why, and in what order to build.
> Generated from a 5-agent audit (financial, resident UX, operations, comms, strategic moat).
> Last updated: 2026-05-18.

---

## How to read this doc

- Items are grouped by **priority tier** (Critical / High / Moat / Polish).
- Each item has: **What's missing → Why it matters → Effort guess → Schema/files touched**.
- "Effort guess" is a t-shirt size estimate by a senior engineer working with Claude:
  - S = 1-3 days
  - M = 1-2 weeks
  - L = 3-6 weeks
  - XL = 2+ months
- Cross-references use `→ §section`.

---

## Tier 1 — CRITICAL (table-stakes vs MyGate / ApnaComplex / NoBrokerHood)

Without these we lose every demo where the buyer has seen an Indian competitor.

### 1.1 Visitor / Gate Pass Module

- **What's missing:** Pre-approve guests, deliveries (Foodpanda/Bykea/Daraz), service personnel. Generate OTP/QR or simple pass code. Guard-facing entry/exit log. Visitor history per flat.
- **Why it matters:** Flagship feature of every PK competitor. Currently chowkidars use paper diaries. Biggest single demo killer.
- **Effort:** L
- **Schema:** new `bms_visitors`, `bms_visitor_logs`. Optionally `bms_visitor_passes` for time-bound codes.
- **Files:** new `app/(admin)/admin/visitors/*`, `app/(resident)/resident/visitors/*`, possibly a public `app/gate/[building]/page.tsx` for guard-side log.
- **Out of scope (per CLAUDE.md):** no OTP/phone auth — use 6-digit pass codes generated server-side, not SMS OTP.

### 1.2 Payment Gateway — JazzCash + EasyPaisa + Raast

- **What's missing:** Resident taps "Pay now" on a dues invoice → completes payment via wallet → invoice auto-marked paid + audit logged.
- **Why it matters:** Biggest single missing feature. ~70% of urban Pakistanis pay via wallets, not cards. Today residents must hand cash to admin.
- **Effort:** L (per gateway), M (after first one)
- **Schema:** new `bms_payment_intents` (gateway transaction record), extend `bms_payments` with `gateway`, `gateway_txn_id`.
- **Files:** new `app/api/payments/jazzcash/route.ts`, `app/api/payments/easypaisa/route.ts`, `app/api/payments/raast/route.ts`, `lib/payments/<gateway>.ts`. Reconciliation cron.
- **Notes:** Start with JazzCash (largest user base). Raast has the lowest fees but bank-partner KYC needed.

### 1.3 WhatsApp Business API + SMS Gateway

- **What's missing:** Programmatic outbound on WhatsApp (templated messages) and SMS. Today only `wa.me` deep links — admin manually clicks per resident.
- **Why it matters:** PK runs on WhatsApp. Bulk dues reminders, payment receipts, emergency alerts must be programmatic. Many seniors only use SMS.
- **Effort:** M (WhatsApp), S (SMS) — gateway integration only. Template approval (Meta) adds 2-3 weeks ops time.
- **Schema:** new `bms_message_log` (channel, recipient, template, status, sent_at).
- **Files:** new `lib/whatsapp.ts`, `lib/sms.ts`. Hook into existing notices + invoices + payments actions.
- **Vendors:** 360dialog / Twilio / Infobip for WhatsApp. Jazz Connect / Telenor / Infobip for SMS.

### 1.4 Web Push + PWA

- **What's missing:** No `manifest.json`, no service worker, no VAPID keys. Residents must reopen the app to see anything.
- **Why it matters:** Notices are invisible. "Add to Home Screen" prompt drives daily-active. PWA also enables future offline shell.
- **Effort:** M
- **Files:** new `public/manifest.json`, `public/sw.js`, `lib/push.ts`, `app/api/push/subscribe/route.ts`. Push-permission UX on resident first-load.
- **Cost:** Free (web standard).

### 1.5 Vehicle + Parking Registry

- **What's missing:** Vehicle table (plate → flat), parking slot allocation map, visitor parking slots.
- **Why it matters:** Daily dispute trigger in every PK tower. Karachi/Lahore high-rises fight over parking constantly.
- **Effort:** M
- **Schema:** new `bms_vehicles`, `bms_parking_slots`, `bms_parking_allocations`.
- **Files:** `app/(admin)/admin/parking/*`, resident view under their flat page.

### 1.6 Helper / Domestic Worker Registry

- **What's missing:** Per-flat registered helpers (cooks, maids, drivers) with CNIC, photo, phone. Gate-facing verification list. Optional attendance.
- **Why it matters:** Universal in PK middle-class flats. Gate currently has no verified list — security gap.
- **Effort:** M
- **Schema:** new `bms_helpers`, `bms_helper_attendance`.
- **Files:** `app/(resident)/resident/helpers/*`, gate-side lookup view.

### 1.7 Amenity / Facility Booking

- **What's missing:** Resident-facing slot booking for community hall, gym, rooftop. Calendar conflict detection.
- **Why it matters:** DHA/Bahria buyers expect this. Currently union committee handles bookings on WhatsApp.
- **Effort:** M
- **Schema:** new `bms_amenities`, `bms_amenity_bookings`.
- **Files:** `app/(resident)/resident/amenities/*`, `app/(admin)/admin/amenities/*`.

### 1.8 Asset Register + AMC Tracker

- **What's missing:** Lifts, generators, pumps, fire equipment, water tanks with serial no., make, install date, warranty. AMC contracts with renewal dates and alerts.
- **Why it matters:** Foundation entity. PM schedules, breakdown logs, safety inspections all anchor on this. Lift/generator failures are #1 resident complaint in PK.
- **Effort:** L
- **Schema:** new `bms_assets`, `bms_amc_contracts`, `bms_asset_logs` (breakdown + runtime).
- **Files:** `app/(admin)/admin/assets/*`.

### 1.9 Audit Log UI

- **What's missing:** `bms_audit_log` table is written everywhere but never surfaced. Union/residents have no visibility.
- **Why it matters:** Selling point for transparency. Union committee disputes get settled instantly with timestamped log.
- **Effort:** S
- **Files:** new `app/(admin)/admin/audit/page.tsx`, `app/(union)/union/audit/page.tsx`. Filter by entity/actor/date.

### 1.10 Auto Dues Reminder Cadence

- **What's missing:** Scheduler that fires D-3, D-day, D+7, D+15 reminders via WhatsApp/SMS/email. Currently `defaulterTemplate` only copies text to clipboard.
- **Why it matters:** Manual collection is the single biggest admin time sink. Auto-cadence → +20-30% collection rate in first month.
- **Effort:** M (depends on §1.3 + a cron worker)
- **Schema:** new `bms_reminder_schedule`. Use Supabase pg_cron or Vercel cron.
- **Files:** `app/api/cron/dues-reminders/route.ts`.

### 1.11 Late Fee Engine

- **What's missing:** Configurable penalty rules per building (Rs/day or % of due) applied automatically after due date.
- **Why it matters:** PK societies routinely add Rs 200-500/month surcharge after the 15th. Today must add manual fine entries.
- **Effort:** S
- **Schema:** extend `bms_buildings` with `late_fee_rule` (jsonb). Extend `bms_invoices` with `penalty_amount`.
- **Files:** `app/actions/billing.ts` invoice generator + cron to apply penalties on overdue.

### 1.12 SOS / Panic Button

- **What's missing:** Big red button on resident home. Notifies admin + union + (optionally) building security WhatsApp group.
- **Why it matters:** Senior + women safety. CLAUDE.md targets seniors. Trust-builder.
- **Effort:** S
- **Schema:** new `bms_emergency_alerts`.
- **Files:** floating SOS button on resident layout.

---

## Tier 2 — HIGH (financial depth, operations completeness)

### 2.1 Financial

| Gap | Why | Effort | Schema/files |
|---|---|---|---|
| **Advance payment / credit balance per flat** | Overpayments currently vanish via `Math.max(0, …)` | S | Extend `bms_payments` allocation logic, add `bms_flat_credits` |
| **Multiple income heads** (parking, transfer/NOC, club, lift fee) | Only `maintenance/entry_fee/fine/other` today | S | Extend `payments.category` enum + UI |
| **Vendor / supplier ledger** | `expenses.vendor` is free-text — no payable aging | M | new `bms_vendors`, link `expenses.vendor_id` |
| **Recurring expense automation** | `is_recurring` column exists, no cron fires it | S | Cron + `bms_expense_schedules` |
| **Reserve vs operating fund split** | Single `fund_balance`; sinking fund can't be ring-fenced | M | new `bms_funds`, payment allocation rules |
| **Year-end closing / opening balance** | Books grow unbounded; no FY lock | M | new `bms_fiscal_years` with opening balances |
| **Budget vs actual variance** | Actuals only, no budget entry | M | new `bms_budgets` per category per fiscal year |
| **Bulk invoice/receipt download** | One-by-one via `ReceiptButton` | S | Zip on server, email link |
| **Partial payment UX** | Backend supports `status:'partial'` but resident UI hides it | S | Update resident dues/payments UI |
| **YoY P&L comparison** | Last 12 months only | S | Finance page chart |

### 2.2 Operations

| Gap | Why | Effort | Schema/files |
|---|---|---|---|
| **Staff shift roster** | 3-shift guard rotation universal in PK, can't schedule | M | new `bms_staff_shifts` |
| **Lift breakdown log** | Required for AMC SLA + inspections | S | Use `bms_asset_logs` from §1.8 |
| **Generator runtime + diesel log** | L/hour tracking, theft prevention | S | Use `bms_asset_logs` from §1.8 |
| **Water tank cleaning log** | Punjab Food Authority + health complaints need photo+date evidence | S | new `bms_facility_records` |
| **Fire safety inspection register** | Civil Defence quarterly inspection | S | Same `bms_facility_records` |
| **Security incident log** | Separate from complaints (intruder, alarm, theft) | S | new `bms_security_incidents` |
| **Society election workflow** | Open/close exist; nomination period + candidate list + voter roll missing | M | Extend `bms_elections`, add `bms_election_nominations` |
| **Quorum tracking in meetings** | Resolutions without quorum are legally challengeable | S | new `bms_meeting_attendees` |
| **Inventory / stores** | Diesel drums, supplies, paint — stock pilferage #2 admin headache | M | new `bms_inventory`, `bms_inventory_movements` |
| **Work order / ticketing** beyond complaints | Admin-initiated jobs with cost estimate + approval | M | Extend `bms_facility_tasks` with cost + approval flow |
| **Preventive maintenance schedule** | Per-asset PM with reminders | S | Link `bms_facility_tasks.asset_id` to `bms_assets` |
| **Multi-building consolidated reporting** | Cross-building P&L, occupancy roll-up | M | Super-admin queries |
| **Building-level KPI dashboard** for super admin | Occupancy %, collection %, open complaints | M | Super-admin page |

### 2.3 Resident UX

| Gap | Why | Effort | Schema/files |
|---|---|---|---|
| **Household member roster** (family, kids) | Push notices to whole family | S | new `bms_household_members` |
| **Move-in / move-out request** | NOC + deposit refund flow | M | new `bms_move_requests` |
| **Document vault** | Bylaws, NOCs, allotment letters, FBR receipts | S | new `bms_documents` + Supabase storage |
| **Lightweight polls/surveys** | Proposals are heavyweight; need quick Y/N | S | new `bms_polls` |
| **Emergency contact directory** | Electrician, plumber, ambulance — one tap from SOS | S | new `bms_emergency_contacts` |
| **Society / neighbour directory** (opt-in) | New residents can find committee head | S | Add `visible_in_directory` flag to `bms_residents` |
| **Festival/event calendar** | Eid, Independence Day, Muharram closures | S | new `bms_events` |
| **Maintenance staff rating** after complaint close | Feedback loop | S | Extend `bms_complaints` with rating |

### 2.4 Communication

| Gap | Why | Effort | Schema/files |
|---|---|---|---|
| **Transactional email** (Resend/SES) | Invoice issued, payment received, complaint update | S | `lib/email.ts` |
| **Broadcast scheduled notices** | Schedule monthly billing announcement | S | Add `scheduled_for` to `bms_notices` + cron |
| **Notice read receipts** | Prove AGM notice was seen (legal coverage) | S | new `bms_notice_reads` |
| **Two-way chat (resident ↔ admin)** | Complaints are one-shot tickets; need threads | M | new `bms_messages` |
| **Comment threads on notices** | Like `bms_proposal_comments` | S | new `bms_notice_comments` |
| **Tenant/owner CC routing** | Both get notice when flat has both | S | Notify-routing logic |
| **Notice templates** (Eid, dues reminder, lift down) | Admin retypes each time | S | new `bms_notice_templates` |

---

## Tier 3 — MOAT (differentiators competitors can't quickly copy)

Ranked by defensibility. These are what make Pulse stand out beyond table stakes.

### 3.1 Utility Bill Auto-Import (K-Electric, LESCO, SSGC, Water Board)

- **What:** Scrape/API-pull utility bills per meter, auto-split common-area bills across flats by share, generate consolidated maintenance invoice.
- **Why moat:** #1 monthly admin pain. No PK competitor solves it. Utility APIs are local + ugly = 6-month build moat.
- **Effort:** XL (per utility — start with K-Electric for Karachi)
- **Files:** `lib/utilities/k-electric.ts`, etc. Cron to fetch monthly.

### 3.2 AI Urdu / Roman-Urdu Voice Complaint Triage + Meeting Summaries

- **What:** Residents send Urdu voice notes → LLM transcribes → categorizes → routes to staff → English audit log. Same for union meeting recordings.
- **Why moat:** Only true accessibility play for senior residents. Zero PK competitor has shipped this.
- **Effort:** L
- **Stack:** Whisper (transcribe) + Claude/GPT (categorize + translate). Voice recording UI on resident complaint form.

### 3.3 Nadra Verisys CNIC + Tenant Verification

- **What:** Verify owner CNIC at onboarding. Mandatory tenant KYC before move-in with police-character clearance upload.
- **Why moat:** Karachi/Lahore police already mandate tenant registration. One-click compliance kills the manual thana trip.
- **Effort:** L (commercial Nadra Verisys integration takes contract negotiation)
- **Files:** `lib/nadra.ts`, tenant onboarding flow.

### 3.4 Cooperative Society Compliance Pack

- **What:** Auto-generated AGM minutes, audit-ready trial balance, member register, Form-A/B exports for Sindh/Punjab Cooperative Societies Act + FBR withholding statements.
- **Why moat:** Every registered society needs this annually and currently pays Rs 50k+ to a manual accountant. Embedded compliance = renewal lock-in.
- **Effort:** L
- **Files:** `app/(admin)/admin/compliance/*`, PDF generators.

### 3.5 Reserve Fund Islamic Money-Market Sweep

- **What:** Idle reserve fund auto-swept into Meezan/Al Baraka Islamic mutual funds. Yield visible on transparency page.
- **Why moat:** Societies sit on Rs 5-50 Lakh idle. Converts Pulse from expense → revenue generator. Shariah-compliance kills religious committee objections.
- **Effort:** XL (banking partnership + regulatory)
- **Files:** TBD — needs Meezan/Al Baraka B2B API.

### 3.6 Group Buying Co-op

- **What:** Aggregate demand across 100+ buildings, negotiate fleet rates with PSO/Askari Guards/OTIS/cleaning vendors.
- **Why moat:** Direct 15-25% hard-rupee savings on diesel alone. B2B GMV revenue line + switching cost.
- **Effort:** XL (commercial + procurement ops, not just code)

### 3.7 Building Credit Score → Bank Loans

- **What:** Score societies on collection rate, reserve coverage, defaulter %. Expose to banks for building-improvement loans (lift, generator).
- **Why moat:** No PK bank underwrites societies because they can't. Pulse becomes the underwriting layer = fintech-grade margins.
- **Effort:** XL (banking partnerships)

### 3.8 White-Label "Handoff Mode" for Builders

- **What:** Developer (DHA, Bahria, private) pre-installs Pulse before possession. Auto-imports flat allotment list, warranty tracker, snag-list workflow.
- **Why moat:** B2B2C distribution. One DHA project = 500 flats instantly. MyGate took India this way.
- **Effort:** L
- **Files:** Multi-tenant theming, snag-list workflow, builder dashboard.

### 3.9 Open API + Tally / QuickBooks / SAP B1 Export

- **What:** REST API + scheduled CSV / Tally-XML drops for property-management firms running 10+ buildings.
- **Why moat:** Managing agents are the real buyers above 50 flats. Without ERP export they default to Excel. Owning the agent channel = wholesale distribution.
- **Effort:** M (REST API), S (Tally-XML)
- **Files:** `app/api/v1/*`, `lib/exports/tally.ts`.

### 3.10 Multi-Language (Urdu) + Senior Accessibility

- **What:** Full Urdu / Roman-Urdu locale toggle. Font-scale A+/A- control. Voice notes on complaints.
- **Why moat:** Chowkidars + seniors need it. CLAUDE.md targets seniors but ships English-only.
- **Effort:** M (i18n setup with `next-intl` + translation pass)
- **Files:** `i18n/`, locale toggle in app shell.

---

## Tier 4 — POLISH (do these in spare cycles)

- Birthday / anniversary auto-greetings (needs `bms_residents.dob`)
- Festival template library (Eid-ul-Fitr, Eid-ul-Azha, Independence Day, Muharram)
- Resident referral / invite flow with attribution
- Lost & found / community board
- Custom branding (society logo, colors) — was in Pro spec, deprioritized for clarity
- Native mobile apps (iOS/Android via Expo) — PWA covers 80% until volume justifies
- Bank reconciliation (CSV import + match)
- Tax handling (FBR sales tax, withholding) — only relevant past filer thresholds
- GL / chart of accounts — flat enums fine until CA-audited annual report needed

---

## Suggested 90-day execution plan

### Sprint 1-2 (Weeks 1-4) — close MyGate gap fast

1. PWA + web push (§1.4) — 1 week
2. Visitor / gate pass module (§1.1) — 3 weeks
3. Vehicle + helper registries (§1.5, §1.6) — 2 weeks parallel
4. Audit log UI (§1.9) — 3 days

### Sprint 3-4 (Weeks 5-8) — the payment moat

5. JazzCash payment gateway (§1.2) — 3 weeks
6. WhatsApp Business API + dues reminder cadence (§1.3 + §1.10) — 3 weeks parallel
7. Late fee engine (§1.11) — 3 days
8. SOS button (§1.12) — 2 days

### Sprint 5-6 (Weeks 9-12) — first moat ships

9. K-Electric bill auto-import POC (§3.1) — 6 weeks
10. Urdu voice complaint triage POC (§3.2) — 4 weeks parallel
11. Asset register + AMC tracker (§1.8) — fills in alongside

After this 90-day window, Pulse closes ~70% of the MyGate/ApnaComplex feature gap *and* ships its first two defensible moats. Everything in Tier 2 / Tier 3 / Tier 4 is the post-Q1 backlog, prioritized by sales feedback at that point.

---

## Open questions before building

- **Payment gateway choice:** JazzCash vs EasyPaisa first? JazzCash has wider user base; EasyPaisa has stronger merchant API. Confirm with sales.
- **WhatsApp BSP:** 360dialog (cheaper, EU-based) vs Twilio (battle-tested, expensive). Template approval cycles differ.
- **Visitor pass mechanism:** static 6-digit code vs QR? QR needs guard-side phone — chowkidars often have only basic phones. Recommend code-based.
- **PWA scope:** install prompt only, or full offline shell? Offline shell adds 2 weeks.
- **Moat sequence:** which utility first — K-Electric (Karachi) or LESCO (Lahore)? Depends on first 10 customers' geography.

---

*This roadmap is generated from the 2026-05-18 multi-agent audit. Rerun the audit after major releases to refresh gaps.*
