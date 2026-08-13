import { headers } from 'next/headers';

/** Builds an absolute origin (e.g. https://arise-eta-six.vercel.app) from
 * the incoming request — works for production, Vercel preview deployments,
 * and local dev alike, without needing a hardcoded env var to keep in sync. */
export function getSiteUrl() {
  const host = headers().get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}
