/*
  Reading the session out of the cookie without asking Supabase.

  The middleware runs on every single request, and until now every one of
  those requests made a network call to Supabase Auth to ask "who is this?".
  That is the whole reason the app felt slow: the same page served with no
  cookies came back in 120ms and with a session cookie in 2,560ms. The
  difference was one round trip, paid on every navigation, every image the
  matcher didn't exclude, every prefetch.

  It was also worse than slow. The access token in the cookie had been expired
  for fifteen hours and was not refreshing, so every request took the
  expensive path — Supabase's own logs showed `token_refreshed`, status 200,
  over and over — and the fresh token it handed back was thrown away every
  time, because the middleware had already given up waiting and sent the
  response. A loop that fed itself.

  So the middleware stops asking. A JWT carries its own expiry in the middle
  segment, in the clear; reading it costs no network and no crypto. The
  middleware only needs to answer "is somebody signed in", and it explicitly
  decides nothing that matters — see the note at the top of middleware.ts.
  Every page re-checks identity properly, against Supabase, one layer in.

  What this file must never become is a security check. It does not verify the
  signature, so everything it returns is a claim, not a fact. Trusting it for
  anything but a redirect would mean a forged cookie could walk in.
*/

/** How close to expiry counts as "needs refreshing now" (seconds). */
export const REFRESH_MARGIN_SECONDS = 60;

/** Supabase splits a session across `.0`, `.1`, … when it outgrows a cookie. */
const MAX_CHUNKS = 10;

/**
 * The cookie name Supabase stores the session under, derived the same way the
 * client library derives it: from the project ref in the URL. Read from the
 * URL rather than hardcoded so a project move can't leave this silently
 * looking for a cookie nobody sets.
 */
export function storageKeyFor(supabaseUrl: string): string | null {
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

function decodeBase64(value: string): string | null {
  try {
    const normalised = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
    // atob gives latin1; the payload is UTF-8, so widen it back.
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Pull the access token out of whatever shape the cookie is in.
 *
 * Three shapes are live in the wild and all three have to work, because a
 * person who signed in last month is still carrying whichever one their
 * browser was given: a plain JSON session, a URL-encoded one, and the
 * `base64-` prefixed form current versions write. Chunked cookies concatenate
 * before any of that.
 */
export function accessTokenFrom(
  read: (name: string) => string | undefined,
  storageKey: string
): string | null {
  let raw = read(storageKey);

  if (raw === undefined) {
    let joined = '';
    for (let i = 0; i < MAX_CHUNKS; i++) {
      const part = read(`${storageKey}.${i}`);
      if (part === undefined) break;
      joined += part;
    }
    if (!joined) return null;
    raw = joined;
  }

  let text = raw;
  if (text.startsWith('%')) {
    try {
      text = decodeURIComponent(text);
    } catch {
      return null;
    }
  }
  if (text.startsWith('base64-')) {
    const decoded = decodeBase64(text.slice('base64-'.length));
    if (decoded === null) return null;
    text = decoded;
  }

  try {
    const session = JSON.parse(text) as unknown;
    if (session && typeof session === 'object' && 'access_token' in session) {
      const token = (session as { access_token: unknown }).access_token;
      return typeof token === 'string' && token.length > 0 ? token : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** The `exp` claim, in seconds, or null if the token isn't readable. */
export function expiryOf(accessToken: string): number | null {
  const middle = accessToken.split('.')[1];
  if (!middle) return null;
  const json = decodeBase64(middle);
  if (json === null) return null;
  try {
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export type SessionState =
  /** No cookie. Nothing to ask Supabase about. */
  | { kind: 'signed-out' }
  /** A live token with time left on it — no network needed. */
  | { kind: 'live'; secondsLeft: number }
  /** Expired, nearly expired, or unreadable: Supabase has to be asked. */
  | { kind: 'needs-supabase'; reason: 'expired' | 'unreadable' };

/**
 * What the middleware should do about this request.
 *
 * Anything we can't read confidently returns `needs-supabase` rather than a
 * guess. Being wrong towards the slow-but-correct path costs a round trip;
 * being wrong the other way would bounce a signed-in person to the login
 * screen, which is the failure people actually notice.
 */
export function sessionStateFrom(
  read: (name: string) => string | undefined,
  supabaseUrl: string,
  nowSeconds: number,
  marginSeconds: number = REFRESH_MARGIN_SECONDS
): SessionState {
  const storageKey = storageKeyFor(supabaseUrl);
  if (!storageKey) return { kind: 'needs-supabase', reason: 'unreadable' };

  const token = accessTokenFrom(read, storageKey);
  if (token === null) {
    // Distinguish "no cookie at all" from "a cookie we couldn't parse". The
    // first is an ordinary signed-out visitor and must stay free; the second
    // is rare and worth a round trip to get right.
    const present = read(storageKey) !== undefined || read(`${storageKey}.0`) !== undefined;
    return present
      ? { kind: 'needs-supabase', reason: 'unreadable' }
      : { kind: 'signed-out' };
  }

  const exp = expiryOf(token);
  if (exp === null) return { kind: 'needs-supabase', reason: 'unreadable' };

  const secondsLeft = exp - nowSeconds;
  return secondsLeft > marginSeconds
    ? { kind: 'live', secondsLeft }
    : { kind: 'needs-supabase', reason: 'expired' };
}
