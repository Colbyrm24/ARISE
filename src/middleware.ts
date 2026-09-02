import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { sessionStateFrom } from '@/lib/session-cookie';

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
/*
  Every signed-in-only path, so an expired session lands on login with the
  destination remembered rather than dumping the person on /today. The four
  at the end were missing, which is why a stale session on a check-in link
  silently lost the link.
*/
const CLIENT_PREFIXES = [
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
  /*
    These five shipped after the list and were never added to it.

    Missing one is usually only a cost: the (client) layout's requireClient()
    still catches it, but by then the page has rendered and paid for a
    supabase.auth.getUser() round trip to do what the edge does with no
    network call at all — which is the exact per-request expense this file
    was rewritten to remove.

    The sharper edge is clearedSession below, which reads the same list. On
    the expired-token-refresh-timeout branch a client sitting on an unlisted
    route got NextResponse.next() instead of clear-and-redirect, and the
    render then called requireClient() → an UNBOUNDED getUser() against the
    still-dead cookie. No deadline, no timeout. That is precisely the hang
    the 8-second deadline further down exists to prevent.
  */
  '/calendar',
  '/leaderboard',
  '/recipes',
  '/welcome',
  '/agreement',
];

/** Every cookie Supabase keeps a session in, including the chunked ones. */
function sessionCookieNames(request: NextRequest) {
  return request.cookies
    .getAll()
    .map((c) => c.name)
    .filter((name) => name.startsWith('sb-') && name.includes('-auth-token'));
}

/**
 * Throw away a session that is over, and send the person somewhere useful.
 *
 * Used only when an expired token could not be refreshed. Clearing is the
 * whole point: leaving the dead cookie in place means the next request
 * repeats the same failed refresh, which is how one stale session turns into
 * a permanently slow app.
 */
function clearedSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedPath = pathname.startsWith('/coach') || CLIENT_PREFIXES.some((p) => pathname.startsWith(p));

  let cleared: NextResponse;
  if (protectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    cleared = NextResponse.redirect(url);
  } else {
    cleared = NextResponse.next();
  }

  for (const name of sessionCookieNames(request)) {
    cleared.cookies.set({ name, value: '', path: '/', maxAge: 0 });
  }
  return cleared;
}

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

  /*
    Almost every request answers this without touching the network.

    Middleware runs on every request, so what it costs, the whole app costs.
    Asking Supabase "who is this?" every time was 2.4 seconds of a 2.56-second
    page load — the same page with no cookies came back in 120ms — and it is
    the entire reason ARISE felt slow. It also went down four times in one day
    when that call hung: MIDDLEWARE_INVOCATION_TIMEOUT on every route at once,
    while /api/health (excluded from the matcher) answered fine.

    The token in the cookie says when it expires, in the clear. While it has
    time left on it, that is all this file needs — see lib/session-cookie.ts
    for why reading it is safe here and nowhere else. Supabase is asked only
    when the token is actually expiring, which is roughly once an hour per
    person instead of once per request.
  */
  const state = sessionStateFrom(
    (name) => request.cookies.get(name)?.value,
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    Math.floor(Date.now() / 1000)
  );

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null;
  let signedIn = state.kind === 'live';

  if (state.kind === 'needs-supabase') {
    /*
      The refresh, and the deadline it gets.

      This used to be 2500ms, which was almost exactly what a refresh took —
      so the response went out a fraction before Supabase answered, the fresh
      cookie set by the callbacks above landed on a response nobody would
      ever see, and the token stayed expired. Which meant the next request
      refreshed again. Colby's session sat fifteen hours past expiry while
      Supabase logged a successful `token_refreshed` for every page he opened.

      Now that this runs about once an hour rather than on every request, it
      can afford to wait properly. Eight seconds is long enough for the
      refresh to come back and its cookie to ride out on `response`, and far
      short of the 25s ceiling that turns a slow middleware into a 504.
    */
    const AUTH_DEADLINE_MS = 8000;
    let timedOut = false;

    try {
      const result = await Promise.race([
        supabase.auth.getUser(),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), AUTH_DEADLINE_MS)),
      ]);
      if (result === 'timeout') {
        timedOut = true;
      } else {
        user = result.data.user;
        signedIn = Boolean(user);
      }
    } catch (err) {
      timedOut = true;
      console.error('middleware auth check failed', {
        pathname: request.nextUrl.pathname,
        reason: state.reason,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (timedOut) {
      console.error('middleware auth check exceeded its deadline', {
        pathname: request.nextUrl.pathname,
        reason: state.reason,
        deadlineMs: AUTH_DEADLINE_MS,
      });

      if (state.reason === 'expired') {
        /*
          Give up on a session that is already over, and say so.

          An expired token that will not refresh is not a slow session, it is
          a dead one — and carrying it costs eight seconds on every single
          request, forever, because the next request finds the same dead
          cookie and tries again. That is not theoretical: Supabase's
          /auth/v1/token endpoint on this project stopped answering refresh
          requests altogether (a call with a deliberately invalid token, made
          straight from a browser, hung past 45 seconds), and one session sat
          fifteen hours past expiry with every page load piling another
          attempt onto the queue. The app was feeding the jam that was
          breaking it.

          So the cookie gets cleared. Signing in again costs one screen and
          fixes it completely, and every request after that is fast. Only for
          `expired`: an unreadable cookie or a wobble on a live session is
          not proof the session is over, and signing someone out on a hiccup
          is its own kind of broken.
        */
        return clearedSession(request);
      }

      /*
        Otherwise fail OPEN, and only here. Nothing above is a security
        boundary: as the note at the top says, role routing happens one layer
        in, and every page calls requireCoach()/requireClient() against
        Supabase itself. Letting the request through costs a signed-out
        visitor a prettier redirect, not access to anything. Failing closed
        would mean breaking the whole product to protect a `?next=` parameter.
      */
      return response;
    }
  }

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
  const isClientRoute = CLIENT_PREFIXES.some((p) => pathname.startsWith(p));

  // Not logged in, trying to reach a protected area -> send to login.
  if (!signedIn && (isCoachRoute || isClientRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return redirectWithFreshCookies(url);
  }

  // Logged in and sitting on an auth page -> hand off to the root, which can
  // read the real role from the database and route accordingly.
  if (signedIn && isAuthRoute) {
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
