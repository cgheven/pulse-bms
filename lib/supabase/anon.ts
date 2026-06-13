import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client using the public anon key (no service role, RLS applies).
// Use for unauthenticated server actions (e.g. public form submissions).
export function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase environment variables.");
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
