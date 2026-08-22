import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Runs on every request.
 *
 * Two jobs:
 * 1. Keep the Supabase session cookie fresh.
 * 2. Enforce, on the server, that clients only ever land in the client
 *    app and coaches only ever land in the coach console. This is a
 *    convenience redirect, NOT the real security boundary — every page
 *    and every API route re-checks the user's identity and role again
 *    on its own. A client should never be able to see another client's
 *    data just because a redirect was skipped.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Getting the user above may have refreshed an expired session and
  // queued fresh cookies onto `response` via the `set`/`remove` callbacks
  // above. Any time we redirect instead of returning `response` directly,
  // we must carry those cookies over onto the redirect — otherwise the
  // browser keeps its old (expired) cookie, the next request refreshes
  // again, and we loop forever ("too many redirects").
  function redirectWithFreshCookies(url: URL) {
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup');
  const isCoachRoute = pathname.startsWith('/coach');
  const isClientRoute = ['/today', '/workouts', '/nutrition', '/messages', '/profile', '/ai', '/onboarding', '/book'].some(
    (p) => pathname.startsWith(p)
  );

  // Not logged in, trying to reach a protected area -> send to login.
  if (!user && (isCoachRoute || isClientRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return redirectWithFreshCookies(url);
  }

  // Logged in and sitting on an auth page -> send them where they belong.
  if (user && isAuthRoute) {
    const role = (user.app_metadata as { role?: string })?.role ?? 'client';
    const url = request.nextUrl.clone();
    url.pathname = role === 'coach' || role === 'admin' ? '/coach/dashboard' : '/today';
    return redirectWithFreshCookies(url);
  }

  // Logged in as a client, trying to reach the coach console -> bounce them.
  if (user && isCoachRoute) {
    const role = (user.app_metadata as { role?: string })?.role ?? 'client';
    if (role !== 'coach' && role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/today';
      return redirectWithFreshCookies(url);
    }
  }

  return response;
}

// Static files never need a session. Letting them through the matcher costs a
// Supabase getUser() round-trip per request, and sw.js is the one that hurts:
// the browser re-checks the service worker on every navigation, so an
// unexcluded worker file adds an auth call to every page load in the app.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|robots.txt|api/health|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)',
  ],
};
