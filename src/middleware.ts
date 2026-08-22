import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Runs on every request.
 *
 * Two jobs:
 * 1. Keep the Supabase session cookie fresh.
 * 2. Send signed-out visitors to the login page, remembering where they
 *    were going.
 *
 * Deliberately does NOT decide anything from the user's role. It used to,
 * reading `user.app_metadata.role` — a field nothing in this codebase has
 * ever written. Every account therefore read as a client, so a coach hitting
 * /coach/dashboard was bounced to /today, where the client layout saw role
 * 'coach' and bounced them to /login, where this file saw a live session and
 * bounced them back: an infinite loop that made the console unreachable.
 *
 * Role lives in our own users table, which the Edge runtime can't read. So
 * role routing happens one layer in, in the layouts and in app/page.tsx,
 * which are the real boundary anyway — every page re-checks identity on its
 * own and always did.
 */
export async function middleware(request: NextRequest) {
  // The path, forwarded so server components can read it. Next doesn't give
  // a page its own pathname, and auth.ts needs it to send somebody back where
  // they were going after they log in.
  const forwarded = new Headers(request.headers);
  forwarded.set('x-pathname', request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: forwarded } });

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
          response = NextResponse.next({ request: { headers: forwarded } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: forwarded } });
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
  // Every signed-in-only path, so an expired session lands on login with the
  // destination remembered rather than dumping the person on /today. The four
  // at the end were missing, which is why a stale session on a check-in link
  // silently lost the link.
  const isClientRoute = [
    '/today',
    '/workouts',
    '/nutrition',
    '/messages',
    '/profile',
    '/ai',
    '/onboarding',
    '/book',
    '/check-in',
    '/progress',
    '/notifications',
  ].some((p) => pathname.startsWith(p));

  // Not logged in, trying to reach a protected area -> send to login.
  if (!user && (isCoachRoute || isClientRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return redirectWithFreshCookies(url);
  }

  // Logged in and sitting on an auth page -> hand off to the root, which can
  // read the real role from the database and route accordingly.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return redirectWithFreshCookies(url);
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
