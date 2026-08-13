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

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup');
  const isCoachRoute = pathname.startsWith('/coach');
  const isClientRoute = ['/today', '/workouts', '/nutrition', '/messages', '/profile', '/ai', '/onboarding'].some(
    (p) => pathname.startsWith(p)
  );

  // Not logged in, trying to reach a protected area -> send to login.
  if (!user && (isCoachRoute || isClientRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Logged in and sitting on an auth page -> send them where they belong.
  if (user && isAuthRoute) {
    const role = (user.app_metadata as { role?: string })?.role ?? 'client';
    const url = request.nextUrl.clone();
    url.pathname = role === 'coach' || role === 'admin' ? '/coach/dashboard' : '/today';
    return NextResponse.redirect(url);
  }

  // Logged in as a client, trying to reach the coach console -> bounce them.
  if (user && isCoachRoute) {
    const role = (user.app_metadata as { role?: string })?.role ?? 'client';
    if (role !== 'coach' && role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/today';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icon.png|apple-icon.png).*)',
  ],
};
