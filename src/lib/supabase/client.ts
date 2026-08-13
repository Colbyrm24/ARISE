import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for use in the browser (client components).
 * Only ever uses the public anon key — safe to ship to the browser.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
