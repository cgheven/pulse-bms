/**
 * Pulse BMS — seed-demo-users
 *
 * One-shot script that provisions the four sales-demo auth users for the
 * Pulse BMS read-only demo experience. Re-runnable: if a user already exists
 * we update password + flags rather than crash. After auth users are in
 * place this script also creates the demo union_members rows (which require
 * a real profile_id) and the proposal votes from those members so the union
 * portal shows realistic governance data.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-demo-users.ts
 *
 * Reads:   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Writes:  auth.users (4 demo users), public.bms_profiles, public.bms_residents
 *          (links the resident user), public.bms_union_members (5 rows),
 *          public.bms_proposal_votes (~12 rows), public.bms_services (6 rows).
 *
 * The demo building UUID is hardcoded — matches supabase/seeds/demo_building.sql.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

// ─── Config ──────────────────────────────────────────────────────────────
const DEMO_BUILDING_ID = "99999999-9999-9999-9999-999999999999";
const DEMO_PASSWORD = "PulseDemo2026!";

type Role = "admin" | "union" | "resident";

// NOTE: No super_admin demo user. A super_admin without a building_id sees
// every real building via the existing permissive SELECT policies (which
// short-circuit on bms_is_super_admin()), so a demo super_admin would leak
// real customer data on reads. Sales pitches to Union Presidents anyway —
// admin / union / resident demo accounts cover every relevant view.
const DEMO_USERS: Array<{
  email: string;
  full_name: string;
  role: Role;
  phone: string;
}> = [
  {
    email: "admin@demo.pulse.app",
    full_name: "Demo Admin",
    role: "admin",
    phone: "03000000002",
  },
  {
    email: "union@demo.pulse.app",
    full_name: "Faisal Qureshi (Union President)",
    role: "union",
    phone: "03000000003",
  },
  {
    email: "resident@demo.pulse.app",
    full_name: "Ali Khan (Resident)",
    role: "resident",
    phone: "03000000004",
  },
];

// ─── Env + client ────────────────────────────────────────────────────────
function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Run with: npx tsx --env-file=.env.local scripts/seed-demo-users.ts",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── Find auth user by email ─────────────────────────────────────────────
// admin.listUsers() is paginated; we need to walk pages until we hit our
// target. Demo is tiny but this code may be run on a project with thousands
// of users so do this properly.
async function findUserByEmail(
  client: SupabaseClient,
  email: string,
): Promise<{ id: string } | null> {
  let page = 1;
  // perPage max is 1000 in Supabase admin API.
  // Stop after 50 pages (50k users) as a safety net.
  for (let i = 0; i < 50; i++) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    if (!data?.users || data.users.length === 0) return null;
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (match) return { id: match.id };
    if (data.users.length < 1000) return null;
    page++;
  }
  return null;
}

// ─── Create or update one demo user ──────────────────────────────────────
async function upsertDemoUser(
  client: SupabaseClient,
  user: (typeof DEMO_USERS)[number],
): Promise<string> {
  const existing = await findUserByEmail(client, user.email);

  let userId: string;
  if (existing) {
    // Rotate password + lift any ban + confirm email so the credential
    // always works regardless of past state.
    const { error } = await client.auth.admin.updateUserById(existing.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      ban_duration: "none",
      user_metadata: { full_name: user.full_name },
    });
    if (error) throw new Error(`updateUser ${user.email}: ${error.message}`);
    userId = existing.id;
  } else {
    const { data, error } = await client.auth.admin.createUser({
      email: user.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: user.full_name },
    });
    if (error || !data?.user) {
      throw new Error(`createUser ${user.email}: ${error?.message ?? "no user"}`);
    }
    userId = data.user.id;
  }

  // All demo accounts live inside the demo building (super_admin demo dropped
  // intentionally — see DEMO_USERS comment above).
  const building_id = DEMO_BUILDING_ID;

  const { error: pErr } = await client.from("bms_profiles").upsert(
    {
      id: userId,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      role: user.role,
      building_id,
      is_active: true,
      is_demo: true,
    },
    { onConflict: "id" },
  );
  if (pErr) throw new Error(`upsert profile ${user.email}: ${pErr.message}`);

  return userId;
}

// ─── Link resident demo user to a resident row ───────────────────────────
// Picks the first owner-relationship resident in the demo building (which is
// Ali Khan on flat A-101 thanks to the deterministic seed) and sets
// profile_id = <resident demo user id> so the resident portal has all the
// joined data — dues, invoices, complaints, etc. — wired up.
async function linkResidentToProfile(
  client: SupabaseClient,
  residentUserId: string,
): Promise<void> {
  // Idempotent: clear any previous link to this profile first so re-runs
  // don't fail the unique constraint (one profile per resident row).
  await client
    .from("bms_residents")
    .update({ profile_id: null })
    .eq("profile_id", residentUserId);

  const { data: resident, error: rErr } = await client
    .from("bms_residents")
    .select("id, full_name")
    .eq("building_id", DEMO_BUILDING_ID)
    .eq("full_name", "Ali Khan")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (rErr) throw new Error(`fetch resident: ${rErr.message}`);
  if (!resident) {
    console.warn("[seed-demo-users] Could not find Ali Khan resident — skipping link");
    return;
  }

  const { error: linkErr } = await client
    .from("bms_residents")
    .update({ profile_id: residentUserId, email: "resident@demo.pulse.app" })
    .eq("id", resident.id);
  if (linkErr) throw new Error(`link resident: ${linkErr.message}`);
}

// ─── Ensure demo admin is recorded as President in bms_union_members ─────
// In PK societies the Admin role IS the building President. Without this
// row their payments-collection card on /union/collections would only show
// "Demo Admin" with no position label — confusing for sales demos. We
// upsert a deterministic id so re-runs collide on the same row.
async function ensureAdminPresident(
  client: SupabaseClient,
  adminUserId: string,
  adminFullName: string,
): Promise<void> {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearEnd = `${new Date().getFullYear() + 1}-12-31`;
  const row = {
    id: deterministicUuid("um:president:admin"),
    building_id: DEMO_BUILDING_ID,
    profile_id: adminUserId,
    full_name: adminFullName,
    position: "president",
    term_start: yearStart,
    term_end: yearEnd,
    is_active: true,
  };
  const { error } = await client
    .from("bms_union_members")
    .upsert(row, { onConflict: "id" });
  if (error) throw new Error(`upsert admin president: ${error.message}`);
}

// ─── Seed union members + their votes ────────────────────────────────────
async function seedUnionMembersAndVotes(
  client: SupabaseClient,
  unionUserId: string,
): Promise<void> {
  // NOTE: Demo Admin holds the President seat (PK convention — admin role
  // doubles as building President). Faisal is repositioned to Vice President
  // so the demo union user still has a senior role for governance flows
  // without colliding on "president" with the admin row.
  // Positions must match the DB check constraint
  // (president / vice_president / secretary / treasurer / member).
  const members = [
    { rn: 1, full_name: "Faisal Qureshi", position: "vice_president" },
    { rn: 2, full_name: "Bilal Hussain",  position: "secretary" },
    { rn: 3, full_name: "Hamza Iqbal",    position: "treasurer" },
    { rn: 4, full_name: "Asad Yousuf",    position: "member" },
    { rn: 5, full_name: "Naveed Ashraf",  position: "member" },
  ];

  // All five point at the same demo union profile_id so the sales team only
  // needs one credential to demo the entire governance flow.
  const memberRows = members.map((m) => ({
    // Deterministic UUID so re-runs upsert in place.
    id: deterministicUuid(`um:${m.rn}`),
    building_id: DEMO_BUILDING_ID,
    profile_id: unionUserId,
    full_name: m.full_name,
    position: m.position,
    term_start: yearStartIso(-6),
    term_end: yearStartIso(18),
    is_active: true,
  }));

  const { error: umErr } = await client
    .from("bms_union_members")
    .upsert(memberRows, { onConflict: "id" });
  if (umErr) throw new Error(`upsert union_members: ${umErr.message}`);

  // 12 votes spread over the 3 demo proposals.
  const proposalIds = {
    1: deterministicUuid("prop:1"),
    2: deterministicUuid("prop:2"),
    3: deterministicUuid("prop:3"),
  };
  const votes: Array<{
    rn_member: number;
    prop: 1 | 2 | 3;
    vote: "approve" | "reject" | "abstain";
  }> = [
    { rn_member: 1, prop: 1, vote: "approve" },
    { rn_member: 2, prop: 1, vote: "approve" },
    { rn_member: 3, prop: 1, vote: "reject" },
    { rn_member: 4, prop: 1, vote: "approve" },
    { rn_member: 5, prop: 1, vote: "abstain" },
    { rn_member: 1, prop: 2, vote: "approve" },
    { rn_member: 2, prop: 2, vote: "approve" },
    { rn_member: 3, prop: 2, vote: "approve" },
    { rn_member: 4, prop: 2, vote: "approve" },
    { rn_member: 5, prop: 2, vote: "approve" },
    { rn_member: 1, prop: 3, vote: "approve" },
    { rn_member: 2, prop: 3, vote: "reject" },
  ];

  // Map member rn → uuid
  const memberIdByRn = new Map(memberRows.map((m, idx) => [idx + 1, m.id]));

  const voteRows = votes.map((v) => ({
    id: deterministicUuid(`vote:${v.prop}:${v.rn_member}`),
    building_id: DEMO_BUILDING_ID,
    proposal_id: proposalIds[v.prop],
    union_member_id: memberIdByRn.get(v.rn_member)!,
    vote: v.vote,
    comment: null,
  }));

  const { error: vErr } = await client
    .from("bms_proposal_votes")
    .upsert(voteRows, { onConflict: "id" });
  if (vErr) throw new Error(`upsert proposal_votes: ${vErr.message}`);
}

// ─── Seed marketplace services owned by the resident demo user ───────────
async function seedDemoServices(
  client: SupabaseClient,
  residentUserId: string,
): Promise<void> {
  // Look up the resident demo user's resident_id + flat_id so the cards
  // surface a flat number in the marketplace.
  const { data: residency } = await client
    .from("bms_residents")
    .select("id, flat_id")
    .eq("profile_id", residentUserId)
    .eq("building_id", DEMO_BUILDING_ID)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const services = [
    {
      rn: 1,
      title: "Laptop & PC repair at home",
      category: "tech_repair",
      description: "Software cleanup, hardware diagnostics, Windows reinstall.",
      price_note: "From Rs 1,500/visit",
    },
    {
      rn: 2,
      title: "Home-cooked biryani (weekends)",
      category: "food_cooking",
      description: "Chicken or beef. Order by Friday for Saturday delivery.",
      price_note: "Rs 600/plate",
    },
    {
      rn: 3,
      title: "Math + Physics tutoring (O-Levels)",
      category: "tutoring",
      description: "Cambridge syllabus. 2 sessions/week.",
      price_note: "Rs 10,000/month",
    },
    {
      rn: 4,
      title: "AC servicing & gas refill",
      category: "home_services",
      description: "Split & window units. Same-day visits.",
      price_note: "Rs 2,500-4,500",
    },
    {
      rn: 5,
      title: "Cat-sitting while you travel",
      category: "pets",
      description: "Feed + clean litter twice a day. References on request.",
      price_note: "Rs 800/day",
    },
    {
      rn: 6,
      title: "Henna application (Eid bookings)",
      category: "beauty_wellness",
      description: "Bridal + simple designs. Home visit included.",
      price_note: "Rs 500-2,500",
    },
  ];

  const rows = services.map((s) => ({
    id: deterministicUuid(`svc:${s.rn}`),
    building_id: DEMO_BUILDING_ID,
    profile_id: residentUserId,
    resident_id: residency?.id ?? null,
    flat_id: residency?.flat_id ?? null,
    title: s.title,
    category: s.category,
    description: s.description,
    price_note: s.price_note,
    is_active: true,
  }));

  const { error } = await client
    .from("bms_services")
    .upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`upsert services: ${error.message}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function deterministicUuid(key: string): string {
  // Mirror the md5(text)::uuid trick the SQL seed uses so the JS-side rows
  // collide on the same primary key as the SQL-side rows.
  // Format: 32 hex chars, hyphenated as 8-4-4-4-12.
  const md5 = createHash("md5").update(`${DEMO_BUILDING_ID}:${key}`).digest("hex");
  return `${md5.slice(0, 8)}-${md5.slice(8, 12)}-${md5.slice(12, 16)}-${md5.slice(16, 20)}-${md5.slice(20, 32)}`;
}

function yearStartIso(monthsFromNow: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsFromNow);
  d.setDate(1);
  d.setUTCHours(0, 0, 0, 0);
  // Snap to Jan 1 of that year (mirrors date_trunc('year', ...) in SQL).
  d.setMonth(0);
  return d.toISOString().slice(0, 10);
}

// ─── Main ────────────────────────────────────────────────────────────────
async function main() {
  const client = admin();
  console.log("[seed-demo-users] Connecting to", process.env.NEXT_PUBLIC_SUPABASE_URL);

  // Verify demo building exists; otherwise we'd cascade into FK violations.
  const { data: building, error: bErr } = await client
    .from("bms_buildings")
    .select("id, name")
    .eq("id", DEMO_BUILDING_ID)
    .maybeSingle();
  if (bErr) throw new Error(`fetch building: ${bErr.message}`);
  if (!building) {
    throw new Error(
      "Demo building not found. Run supabase/seeds/demo_building.sql first.",
    );
  }
  console.log(`[seed-demo-users] Demo building: ${building.name} (${building.id})`);

  // Create / update 4 demo users
  const userIds: Record<Role, string> = {} as Record<Role, string>;
  for (const u of DEMO_USERS) {
    const id = await upsertDemoUser(client, u);
    userIds[u.role] = id;
    console.log(`[seed-demo-users] ${u.role.padEnd(11)} ${u.email}  →  ${id}`);
  }

  // Wire up dependent demo data
  await linkResidentToProfile(client, userIds.resident);
  console.log("[seed-demo-users] Linked resident demo user to Ali Khan");

  await seedUnionMembersAndVotes(client, userIds.union);
  console.log("[seed-demo-users] Seeded 5 union_members + 12 proposal_votes");

  // Add the demo admin user as the active President so /union/collections
  // can attribute their cash receipts to a committee position.
  const adminUser = DEMO_USERS.find((u) => u.role === "admin")!;
  await ensureAdminPresident(client, userIds.admin, adminUser.full_name);
  console.log(
    `[seed-demo-users] Linked admin demo user (${adminUser.full_name}) as President`,
  );

  await seedDemoServices(client, userIds.resident);
  console.log("[seed-demo-users] Seeded 6 marketplace services");

  // ── Done ──
  console.log("\n=== Demo credentials ===");
  for (const u of DEMO_USERS) {
    console.log(`  ${u.role.padEnd(11)} ${u.email}   pw: ${DEMO_PASSWORD}`);
  }
  console.log("\nDemo building id:", DEMO_BUILDING_ID);
  console.log("Share these with sales; the password is the same for all four.");
}

main().catch((err) => {
  console.error("[seed-demo-users] failed:", err);
  process.exit(1);
});
