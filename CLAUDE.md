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
- All DB tables prefixed `bms_*`. RLS enabled on every table; policies live in `bms_002_rls_policies` migration.
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
- `lib/utils.ts` — `cn`, `formatCurrency`, `formatLakh`, `formatDate`, `formatPhone`, `formatCNIC`
- `types/index.ts` — shared types: `Role`, `Building`, `Profile`, `Flat`, `Resident`, `StaffRole`
- `components/ui/*` — Radix primitives (button, input, label, dialog, select, etc.)
- `components/layout/app-shell.tsx` — top nav shell (use this in every role layout)

## UX rules (senior-friendly)
- Base font 18px, headings 24-36px.
- Tap targets ≥ 56px on primary buttons (`btn-big` class).
- High contrast (white bg, near-black text, deep blue primary).
- Plain English labels — no jargon. "Building Finance" not "Treasury".
- All amounts formatted via `formatCurrency` → `Rs. 11,000`.
- Use `formatLakh` for >100k → `Rs. 1.1 Lakh`.
- Status pills: `.status-paid`, `.status-pending`, `.status-overdue`, `.status-defaulter`.

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
- Do NOT touch other tables in the DB (`pulse_*`, `hms_*` — those belong to prior projects).
- Do NOT add OTP/phone auth (out of scope).
- Do NOT add the `zkteco-js` dep back.
- Do NOT introduce dark mode tokens — light only for v1.
