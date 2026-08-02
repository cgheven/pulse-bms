# Pulse BMS — Building Management System 

## Stack
- Next.js 15 (App Router, Turbopack) + React 19
- Supabase (Postgres + Auth + RLS) — `@supabase/ssr`
- Tailwind CSS + Radix UI primitives
- TypeScript strict
- Currency: PKR (helpers in `lib/utils.ts`: `formatCurrency`, `formatLakh`)

## Architecture
- **Multi-tenant** via `building_id` on every row.
- **Role hierarchy**: `super_admin` > `admin` > `union` > `resident`.
- Auth: email + password (Supabase auth). No OTP for v1.
- All DB tables prefixed `bms_*`. RLS enabled on every table; policies are defined alongside each feature's own timestamped migration (there is no single "all policies" migration).
- Audit log: `bms_audit_log`. Use `writeAuditLog()` from `lib/audit.ts` on every mutation.

## Route Groups (App Router)
- `app/(auth)/login` — public sign-in
- `app/(super-admin)/super-admin/*` — owns buildings + admins
- `app/(admin)/admin/*` — per-building admin: flats, residents, billing, payments, staff, expenses, facility, union, notices, finance
- `app/(union)/union/*` — committee: proposals, votes, meetings, expenses (with approval), facility, finance, notices
- `app/(resident)/resident/*` — transparency portal: dues, payments, complaints, building finance, notices

## Files & Boundaries
- `lib/supabase/client.ts` — browser client
- `lib/supabase/server.ts` — server-side client (SSR cookies)
- `lib/supabase/admin.ts` — service-role admin client (server-only)
- `lib/supabase/middleware.ts` — session refresh + auth redirect
- `lib/auth.ts` — `requireSession`, `requireRole`, `requireBuilding`
- `lib/audit.ts` — `writeAuditLog`
- `lib/utils.ts` — `cn`, `formatCurrency`, `formatLakh`, `formatDate`, `formatPhone`, `formatCNIC`, `formatMonthLabel`, `getMonthBounds`
- `lib/finance-totals.ts` — `getCashTotals`, `getBankTotalsBefore`, `cashBalanceFrom`; the
  only correct way to sum money across a whole table (see "Database constraints")
- `types/index.ts` — shared types: `Role`, `Building`, `Profile`, `Flat`, `Resident`, `StaffRole`
- `components/ui/*` — Radix primitives (button, input, label, dialog, select, etc.)
- `components/layout/app-shell.tsx` — top nav shell (use this in every role layout)

## UX rules (senior-friendly)
- Base font 18px, headings 24-36px.
- Tap targets ≥ 56px on primary buttons (`btn-big` class).
- **Dark theme.** `--background: 215 28% 7%` (deep navy), `--foreground` near-white,
  `--primary: 38 92% 55%` (amber gold), `html { color-scheme: dark }`. Tokens live in
  `app/globals.css`. There is no light theme — do not add `dark:` variants or assume a
  white background.
- Plain English labels — no jargon. "Building Finance" not "Treasury".
- All amounts formatted via `formatCurrency` → `Rs. 11,000`.
- Use `formatLakh` for >100k → `Rs. 1.1 Lakh`.
- Status pills: `.status-paid`, `.status-pending`, `.status-overdue`, `.status-defaulter`.

## Database constraints (verified 2026-08-02 — read before writing any query)
- **Supabase project `ggjtqchnfjfiwjqhcppq` ("Pulse - BMS") holds ONLY `bms_*` tables (47).**
  There are no `pulse_*` or `hms_*` tables here. HMS is a **separate** Supabase project
  (`tfllabbotbfpbfvtkndt`) — nothing in this repo can reach it.
- **PostgREST aggregate functions are DISABLED.** `.select("amount.sum()")` returns
  `PGRST123 "Use of aggregate functions is not allowed"` with `data: null`. Because most
  call sites destructure `{ data }` and ignore `error`, this fails **silently as 0** —
  it shipped that way and made every money figure on the dashboard and reports read
  Rs. 0. Never use aggregate syntax.
  - For money totals use `lib/finance-totals.ts` (`getCashTotals`, `getBankTotalsBefore`),
    backed by the `bms_building_cash_totals` / `bms_building_bank_totals_before` RPCs
    with an automatic paged fallback.
  - For counts use `.select("*", { count: "exact", head: true })` — `count` is a header,
    not an aggregate, and works fine.
- **`max_rows` is 1000.** An unbounded `.select()` silently truncates at 1000 rows and
  returns no error. Anything summing or counting a whole table must paginate via
  `.range()` (see `pagedSum` in `lib/finance-totals.ts`) or use an RPC.
- Prefer a `bms_`-prefixed SQL function over client-side aggregation for whole-table
  math. `SECURITY INVOKER` so RLS still applies — see
  `supabase/migrations/20260802000001_bms_cash_totals_rpc.sql`.
- Migrations can be applied with the Management API using `SUPABASE_ACCESS_TOKEN` from
  `.env.local`: `POST https://api.supabase.com/v1/projects/<ref>/database/query`.
  Use `curl` — Cloudflare 403s some other user-agents. Always verify the result against
  real rows afterwards; a clean typecheck proves nothing about a query.

## Server Actions Pattern
- One actions file per module under `app/actions/<module>.ts`.
- Every action: `"use server"`, `requireRole(...)` first, then mutation, then `writeAuditLog(...)`, then `revalidatePath(...)`.

## Schema cheat-sheet (bms_*)
- `buildings` — tenant root
- `profiles` — extends auth.users (role + building_id)
- `flats` — units (per building)
- `residents` — occupants (one flat may have owner + tenant)
- `union_members`, `elections`, `meetings`
- `invoices`, `payments` — maintenance billing
- `staff`, `attendance`, `salary_payments`
- `expenses`
- `facility_tasks`, `complaints`
- `notices`
- `proposals`, `proposal_votes` (immutable), `proposal_comments`
- `audit_log`

## Forbidden
- Do NOT use PostgREST aggregate syntax (`.sum()`, `.avg()`) — disabled, fails silently
  as 0. See "Database constraints".
- Do NOT point anything at the HMS Supabase project — it is separate and holds live
  client data.
- Do NOT add OTP/phone auth (out of scope).
- Do NOT add the `zkteco-js` dep back.
- Do NOT add a light theme or `dark:` variants — the app is dark-only.
