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

  // getUser() validates the token with Supabase's auth server and refreshes it if needed.
  // This correctly handles deleted users — if the auth account was removed the token is
  // rejected, Supabase SSR clears the stale cookies, and routing treats them as logged out.
  // Must run BEFORE any early return so session cookies are always refreshed and auth
  // state is always validated — including for RSC prefetch requests.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RSC prefetch requests skip the redirect logic only — auth was already validated above.
  // Returning early here (before getUser) would have allowed unauthenticated access to
  // protected routes by anyone who sets the `rsc: 1` or `next-router-prefetch: 1` header.
  const isRscPrefetch =
    request.headers.get("rsc") === "1" ||
    request.headers.get("next-router-prefetch") === "1";

  if (isRscPrefetch) {
    return supabaseResponse;
  }

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");
  // /find is the public discovery marketplace — must be reachable without
  // signing in (drives word-of-mouth). Keep auth/API allowlist as-is.
  // Tight match: only /find and /find/* (not /findings or similar).
  const isFind = pathname === "/find" || pathname.startsWith("/find/");
  const isPricing = pathname === "/pricing";
  const isRegister = pathname === "/register" || pathname.startsWith("/register/");
  const isResetPassword =
    pathname === "/auth/reset-password" || pathname.startsWith("/auth/reset-password/");
  const isLanding = pathname === "/";
  const isPublic =
    isAuthRoute || pathname.startsWith("/api/") || isFind || isPricing || isRegister || isResetPassword || isLanding;

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect already-authenticated users away from login AND register pages.
  // /auth/reset-password is excluded intentionally — we don't auto-redirect there
  // because a logged-in user may still legitimately follow a reset link.
  if (user && (isAuthRoute || isRegister)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
