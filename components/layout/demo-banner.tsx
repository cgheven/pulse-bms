import Link from "next/link";
import { Zap } from "lucide-react";
import { getSession } from "@/lib/auth";

/**
 * Pulse BMS — Demo banner.
 *
 * Renders only when the active session profile has is_demo=true. Mirrors the
 * GMS demo strip exactly for visual consistency across the CGHEVEN product
 * family — amber tint, centered, compact, single-line.
 *
 * Server component (reads session via cache). Wrapped in <Suspense fallback={null}>
 * inside each role layout so it never blocks the shell first paint.
 */
export async function DemoBanner() {
  const session = await getSession();
  if (!session?.profile.is_demo) return null;

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs font-medium shrink-0 w-full">
      <Zap className="w-3.5 h-3.5 shrink-0" />
      <span>You&apos;re in demo mode — data is read-only.</span>
      <Link
        href="/pricing"
        className="underline underline-offset-2 hover:text-amber-300 transition-colors"
      >
        Sign up to save changes →
      </Link>
    </div>
  );
}
