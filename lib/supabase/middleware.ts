import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          );
        },
      },
    }
  );

  // RSC prefetch requests get a fast path — no auth roundtrip.
  // Next.js sends a "RSC" header and uses `?_rsc=` for these requests.
  // The actual page render (full doc load on click) still validates auth below.
  const isRscPrefetch =
    request.headers.get("rsc") === "1" ||
    request.headers.get("next-router-prefetch") === "1";

  if (isRscPrefetch) {
    return supabaseResponse;
  }

  // getUser() validates the token with Supabase's auth server and refreshes it if needed.
  // This correctly handles deleted users — if the auth account was removed the token is
  // rejected, Supabase SSR clears the stale cookies, and routing treats them as logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");
  // /find is the public discovery marketplace — must be reachable without
  // signing in (drives word-of-mouth). Keep auth/API allowlist as-is.
  // Tight match: only /find and /find/* (not /findings or similar).
  const isFind = pathname === "/find" || pathname.startsWith("/find/");
  const isPublic =
    isAuthRoute || pathname.startsWith("/api/") || isFind;

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
