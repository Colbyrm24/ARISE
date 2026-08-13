import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase client for use on the server (server components, route handlers,
 * server actions). Reads/writes the session from cookies so the logged-in
 * user is available anywhere in the request.
 *
 * This is where every "is this really their data" check happens — never
 * trust a role or client id that came from the browser.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component — safe to ignore because
            // middleware refreshes the session on every request anyway.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // same as above
          }
        },
      },
    }
  );
}

/**
 * Admin client — uses the SERVICE ROLE key and bypasses row-level security.
 * Only ever import this in server-only code (API routes, webhooks, server
 * actions). Never import this in a file that could end up in a client bundle.
 */
export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get() {
          return undefined;
        },
        set() {},
        remove() {},
      },
    }
  );
}
