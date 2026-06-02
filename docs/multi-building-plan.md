# Multi-Building Admin — Implementation Plan

**Date:** 2026-06-02  
**Status:** Planning  
**Scope:** Allow a single admin account to be assigned to one or more buildings, with a building switcher in the nav.

---

## 1. Current State (The Problem)

Every `bms_profiles` row has a single nullable `building_id` column.  
`lib/auth.ts → requireBuilding()` reads `profile.building_id` directly.  
`lib/auth.ts → getCurrentBuildingName()` reads `profile.building_id` directly.  
All 29 server action files read `profile.building_id` to scope every DB query.  
`app/(admin)/admin/page.tsx` reads `profile.building_id` directly.  
15+ admin pages read `profile.building_id` directly.  
RLS policy function `bms_current_building()` reads `auth.jwt() ->> 'building_id'` (the profile value baked into the JWT).

Result: one admin = one building, hardcoded at every layer.

---

## 2. Target State

- **Junction table** `bms_admin_buildings` — many-to-many (profile ↔ building).
- **Active building cookie** `bms-active-building` — which building is currently selected in this browser session.
- **`lib/building-context.ts`** — single helper that all server actions call instead of `profile.building_id`.
- **Building switcher UI** in the admin nav — exactly like the reference screenshot (current building shown with chevron, dropdown lists all assigned buildings, checkmark on active, count badge e.g. `2 / 5`).
- **SuperAdmin Admins page** — shows all buildings per admin, "Manage Buildings" dialog to add/remove.
- **RLS updated** — `bms_current_building()` replaced with `bms_is_admin_of(building_id uuid)` that checks the junction table, so a multi-building admin can access data for any of their assigned buildings (app-level filter still scopes queries to the active building only).

---

## 3. Design Decisions

### 3.1 Active Building Storage: Cookie (not DB write)
Switching buildings updates a server-side cookie (`bms-active-building`), not the `profile.building_id` column.  
Why: Zero DB writes on switch → instant, no cache invalidation needed for profile. Cookie is HTTP-only, server-readable via `next/headers`.  
Fallback: If cookie is missing or invalid (e.g. building revoked), fall back to the admin's first assigned building (ordered by `created_at`).

### 3.2 profile.building_id: Keep as "Primary Building"
Do NOT remove `building_id` from `bms_profiles`. It becomes the admin's **primary building** — the one they land on after a fresh login (no cookie set). SuperAdmin can still set it when inviting an admin (first assignment = primary).  
Why: Minimal schema disruption. Existing single-building admins continue to work without any cookie.

### 3.3 RLS: Junction Table Check
Replace `bms_current_building()` with `bms_is_admin_of(bid uuid)` Postgres function that checks `bms_admin_buildings`. This allows the DB to correctly permit an admin to operate on any of their buildings.  
The app-level `.eq("building_id", activeBuilding)` filter remains in all queries — it provides the single-building scoping within a session. RLS is the security backstop.

### 3.4 Non-admin Roles: Unchanged
`union`, `resident`, `guard` roles still use `profile.building_id` directly. Multi-building only applies to `admin` role.  
`super_admin` has no building scope (unchanged).

### 3.5 Building Names: SuperAdmin Creates with Full Name
SuperAdmin creates buildings with names, exactly as today. Admin can rename from Settings. No nameless slots.

---

## 4. Database Changes

### Migration 1: Junction Table
```sql
-- bms_admin_buildings: admin ↔ building many-to-many
CREATE TABLE bms_admin_buildings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  building_id uuid NOT NULL REFERENCES bms_buildings(id) ON DELETE CASCADE,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, building_id)
);

-- RLS: super_admin sees all, admin sees their own rows
ALTER TABLE bms_admin_buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin full access"
  ON bms_admin_buildings FOR ALL
  USING (EXISTS (SELECT 1 FROM bms_profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "admin read own assignments"
  ON bms_admin_buildings FOR SELECT
  USING (profile_id = auth.uid());
```

### Migration 2: Seed Existing Assignments
```sql
-- Migrate all current admin profiles that have a building_id
INSERT INTO bms_admin_buildings (profile_id, building_id, is_primary)
SELECT id, building_id, true
FROM bms_profiles
WHERE role = 'admin' AND building_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

### Migration 3: New RLS Helper Function
```sql
-- Replace bms_current_building() usage
-- Returns true if the current user is assigned to the given building
CREATE OR REPLACE FUNCTION bms_is_admin_of(bid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM bms_admin_buildings
    WHERE profile_id = auth.uid()
      AND building_id = bid
  )
$$;

-- Update all admin-scoped RLS policies on every bms_* table
-- Pattern:
-- Old: USING (building_id = bms_current_building())
-- New: USING (
--   (SELECT role FROM bms_profiles WHERE id = auth.uid()) = 'super_admin'
--   OR bms_is_admin_of(building_id)
-- )
```

---

## 5. New Files

### `lib/building-context.ts`
```ts
"use server";  // Not "use server" directly — pure helper, imported by server actions

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth";

export const ACTIVE_BUILDING_COOKIE = "bms-active-building";

/**
 * Returns the building_id the current admin is actively working in.
 * - For admin role: reads cookie, validates against junction table, falls back to primary.
 * - For all other roles: returns profile.building_id (unchanged behaviour).
 * - For super_admin: returns null (no building scope).
 */
export async function getActiveBuilding(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  const { profile } = session;

  if (profile.role === "super_admin") return null;

  // Non-admin roles are still single-building
  if (profile.role !== "admin") return profile.building_id;

  // Admin: try cookie first
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(ACTIVE_BUILDING_COOKIE)?.value;

  if (cookieVal) {
    // Validate cookie against junction table (security: cookie could be tampered)
    const adminDb = createAdminClient();
    const { data } = await adminDb
      .from("bms_admin_buildings")
      .select("building_id")
      .eq("profile_id", profile.id)
      .eq("building_id", cookieVal)
      .maybeSingle();
    if (data) return cookieVal;
    // Invalid cookie — fall through to primary
  }

  // Fall back to primary building (profile.building_id)
  return profile.building_id;
}

/**
 * Returns all buildings assigned to the current admin (for the switcher UI).
 * Returns empty array for non-admin roles.
 */
export async function getAssignedBuildings(): Promise<{ id: string; name: string; is_primary: boolean }[]> {
  const session = await getSession();
  if (!session || session.profile.role !== "admin") return [];

  const adminDb = createAdminClient();
  const { data } = await adminDb
    .from("bms_admin_buildings")
    .select("building_id, is_primary, bms_buildings(id, name)")
    .eq("profile_id", session.profile.id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  return (data ?? []).map((row: any) => ({
    id: row.building_id,
    name: row.bms_buildings?.name ?? "Unknown",
    is_primary: row.is_primary,
  }));
}
```

### `app/actions/switch-building.ts`
```ts
"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { ACTIVE_BUILDING_COOKIE } from "@/lib/building-context";
import { revalidatePath } from "next/cache";

export async function switchBuilding(buildingId: string) {
  const { profile } = await requireRole("admin");

  // Validate this building is actually assigned to this admin
  const adminDb = createAdminClient();
  const { data } = await adminDb
    .from("bms_admin_buildings")
    .select("building_id")
    .eq("profile_id", profile.id)
    .eq("building_id", buildingId)
    .maybeSingle();

  if (!data) throw new Error("Building not assigned to your account.");

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_BUILDING_COOKIE, buildingId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  revalidatePath("/admin", "layout");
}
```

### `components/layout/building-switcher.tsx`
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { switchBuilding } from "@/app/actions/switch-building";

interface Props {
  buildings: { id: string; name: string; is_primary: boolean }[];
  activeBuildingId: string;
  activeBuildingName: string;
}

export function BuildingSwitcher({ buildings, activeBuildingId, activeBuildingName }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (buildings.length <= 1) {
    // Single building — show name only, no dropdown
    return (
      <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground truncate max-w-[180px]">
        <Building2 className="w-3.5 h-3.5 shrink-0" />
        {activeBuildingName}
      </span>
    );
  }

  function handleSwitch(buildingId: string) {
    if (buildingId === activeBuildingId) { setOpen(false); return; }
    startTransition(async () => {
      await switchBuilding(buildingId);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        disabled={pending}
        className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors max-w-[200px] disabled:opacity-60"
      >
        <Building2 className="w-3.5 h-3.5 shrink-0 text-primary" />
        <span className="truncate font-medium">{activeBuildingName}</span>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
          {buildings.findIndex((b) => b.id === activeBuildingId) + 1} / {buildings.length}
        </span>
        <ChevronDown className={cn("w-3 h-3 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 w-64 z-20 rounded-xl border border-sidebar-border bg-sidebar shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-sidebar-border">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Buildings &nbsp;·&nbsp; {buildings.length}
              </p>
            </div>
            <ul className="p-1">
              {buildings.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => handleSwitch(b.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm hover:bg-white/5 transition-colors text-left"
                  >
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate text-foreground">{b.name}</span>
                    {b.id === activeBuildingId && (
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
```

---

## 6. Files to Modify

### `lib/auth.ts`
- `requireBuilding()`: Call `getActiveBuilding()` instead of reading `profile.building_id`
- `getCurrentBuildingName()`: Call `getActiveBuilding()` to get building id, then fetch name

### `app/(admin)/layout.tsx`
- Fetch `getAssignedBuildings()` and `getActiveBuilding()` server-side
- Pass to `BuildingSwitcher` in the `navbarUser` slot

### `components/layout/app-shell.tsx`
- `NavbarUserClient`: Accept optional `buildingSwitcher` slot (server rendered)
- OR: Pass `buildingSwitcher` node in the `navbarUser` slot directly

### `app/actions/super-admin.ts`
- `createAdmin()`: After creating admin + setting `profile.building_id`, ALSO insert into `bms_admin_buildings` with `is_primary: true`
- `reassignAdmin()`: Becomes `setPrimaryBuilding()` — updates `profile.building_id` AND sets `is_primary` on junction table
- **NEW** `addAdminToBuilding(profileId, buildingId)`: Insert into junction table
- **NEW** `removeAdminFromBuilding(profileId, buildingId)`: Delete from junction table (prevent removing primary if it's the last one)

### `app/(super-admin)/super-admin/admins/page.tsx`
- Show buildings column as list of assigned building names (not just one)
- Add "Manage Buildings" action to `AdminRowActions`

### `components/super-admin/admin-row-actions.tsx`
- Add "Manage Buildings" button → opens `AdminBuildingsDialog`

### **NEW** `components/super-admin/admin-buildings-dialog.tsx`
- Multi-select dialog: list all buildings, checkboxes for assigned ones
- Calls `addAdminToBuilding` / `removeAdminFromBuilding`

### All 29 server action files in `app/actions/`
- Replace `profile.building_id` → `await getActiveBuilding()`
- Import `getActiveBuilding` from `@/lib/building-context`
- Guard: `if (!buildingId) throw new Error("No active building")`

---

## 7. Files NOT to Modify
- `union`, `resident`, `guard` action files — still use `profile.building_id`
- `middleware.ts` — no changes
- `lib/supabase/*` — no changes
- Report client components — they receive `buildingId` as a prop from server, no direct profile read

---

## 8. Implementation Phases

### Phase 1 — Database (no UI impact, backward compatible)
1. Write migration: create `bms_admin_buildings` table + RLS
2. Write migration: seed from existing `profile.building_id`
3. Write migration: `bms_is_admin_of()` helper + update all RLS policies
4. Apply migrations

### Phase 2 — Core Context Layer
5. Create `lib/building-context.ts`
6. Create `app/actions/switch-building.ts`
7. Update `lib/auth.ts` (`requireBuilding`, `getCurrentBuildingName`)

### Phase 3 — Server Actions (29 files)
8. Update all admin server actions to use `getActiveBuilding()`

### Phase 4 — Building Switcher UI
9. Create `components/layout/building-switcher.tsx`
10. Update `app/(admin)/layout.tsx` to fetch buildings + pass to switcher
11. Update `components/layout/app-shell.tsx` to slot in switcher

### Phase 5 — SuperAdmin Multi-Building Management
12. Add `addAdminToBuilding`, `removeAdminFromBuilding` to `super-admin.ts`
13. Create `components/super-admin/admin-buildings-dialog.tsx`
14. Update `admin-row-actions.tsx` and `admins/page.tsx`

### Phase 6 — Multi-Agent Review Pass
15. Functionality agent: verify end-to-end flows
16. Security agent: RLS policies, cookie validation, authorization bypass attempts
17. Performance agent: N+1 queries, caching, junction table indexes
18. Production readiness agent: error handling, edge cases, cookie expiry

---

## 9. Edge Cases to Handle

| Case | Handling |
|------|----------|
| Admin has 1 building | Switcher shows name only, no dropdown |
| Cookie building gets revoked | Fall back to primary building, clear cookie |
| Admin's only building is removed | Show "No building assigned" (same as today) |
| Admin switches building mid-session | Cookie update + router.refresh() reloads all server components |
| Super admin creates admin with no buildings yet | `building_id` null, junction table empty, redirect to /no-building |
| Admin tries to switch to a building not in their list | Server action throws, cookie not set |
| Profile cache (5 min) stale after building switch | Cookie-based active building bypasses profile cache — no issue |

---

## 10. Security Checklist

- [ ] Cookie is `httpOnly` + `sameSite: lax` — not readable by JS, not sent cross-site
- [ ] Every `switchBuilding` call validates against junction table (prevents IDOR)
- [ ] `getActiveBuilding()` validates cookie against junction table on every request
- [ ] RLS `bms_is_admin_of()` is `SECURITY DEFINER` to prevent privilege escalation
- [ ] `addAdminToBuilding` restricted to `super_admin` only
- [ ] `removeAdminFromBuilding` restricted to `super_admin` only, prevents removing last building
- [ ] Junction table RLS: admin can only SELECT own rows (not INSERT/UPDATE/DELETE — only super_admin can)
- [ ] Audit log: `addAdminToBuilding` and `removeAdminFromBuilding` both write to `bms_audit_log`

---

## 11. Performance Checklist

- [ ] Index on `bms_admin_buildings(profile_id)` — used on every request to validate cookie
- [ ] Index on `bms_admin_buildings(building_id)` — used in RLS policies
- [ ] `getAssignedBuildings()` cached per-user (5 min, same as profile cache)
- [ ] `bms_is_admin_of()` is `STABLE` (can be cached within a transaction)
- [ ] Building switcher data fetched once in layout, passed as props — no per-page refetch
