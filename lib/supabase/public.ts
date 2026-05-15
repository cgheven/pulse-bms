// Public Supabase client for unauthenticated marketplace routes.
//
// Uses the anon key — RLS + column-whitelist views are the security boundary,
// NOT the service-role admin client. We deliberately avoid `createAdminClient`
// on public surfaces so a misconfigured query can't leak finance fields like
// `fund_balance`, `entry_fee_*`, `outstanding_dues`.
//
// No cookie handling — anonymous visitors don't have sessions to refresh.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-pulse-bms-public": "1" } },
    },
  );
}
