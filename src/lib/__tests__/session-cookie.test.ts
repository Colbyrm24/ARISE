import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  accessTokenFrom,
  expiryOf,
  sessionStateFrom,
  storageKeyFor,
  REFRESH_MARGIN_SECONDS,
} from '../session-cookie';

/*
  The middleware runs on every request, so what it costs the whole app costs.
  These tests are about one number: how often it goes to the network.

  The bug they exist to stop coming back is not an exception — it is a page
  that still works and takes 2.5 seconds, which nobody notices in review.
*/

const URL_ = 'https://oqbzrmllmgcxkuriyboo.supabase.co';
const KEY = 'sb-oqbzrmllmgcxkuriyboo-auth-token';

function b64url(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function tokenExpiring(atEpochSeconds: number) {
  return `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'u1', exp: atEpochSeconds })}.sig`;
}

function cookieFor(session: unknown) {
  return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');
}

function reader(jar: Record<string, string>) {
  return (name: string) => jar[name];
}

test('the cookie name is derived from the project ref', () => {
  assert.equal(storageKeyFor(URL_), KEY);
  assert.equal(storageKeyFor('not a url'), null);
});

test('reads the access token out of the base64- cookie Supabase writes today', () => {
  const token = tokenExpiring(2_000_000_000);
  const jar = { [KEY]: cookieFor({ access_token: token, refresh_token: 'r' }) };
  assert.equal(accessTokenFrom(reader(jar), KEY), token);
});

test('reads plain JSON and URL-encoded cookies too', () => {
  // Sessions written by older versions are still in people's browsers.
  const token = tokenExpiring(2_000_000_000);
  const plain = { [KEY]: JSON.stringify({ access_token: token }) };
  assert.equal(accessTokenFrom(reader(plain), KEY), token);

  const encoded = { [KEY]: encodeURIComponent(JSON.stringify({ access_token: token })) };
  assert.equal(accessTokenFrom(reader(encoded), KEY), token);
});

test('reassembles a session split across chunked cookies', () => {
  const token = tokenExpiring(2_000_000_000);
  const whole = cookieFor({ access_token: token, refresh_token: 'r'.repeat(100) });
  const half = Math.ceil(whole.length / 2);
  const jar = { [`${KEY}.0`]: whole.slice(0, half), [`${KEY}.1`]: whole.slice(half) };
  assert.equal(accessTokenFrom(reader(jar), KEY), token);
});

test('reads the expiry out of a JWT without verifying it', () => {
  assert.equal(expiryOf(tokenExpiring(1234)), 1234);
  assert.equal(expiryOf('nonsense'), null);
  assert.equal(expiryOf('a.b.c'), null);
});

test('a live token needs no network call', () => {
  const now = 1_800_000_000;
  const jar = { [KEY]: cookieFor({ access_token: tokenExpiring(now + 3600) }) };
  const state = sessionStateFrom(reader(jar), URL_, now);
  assert.equal(state.kind, 'live');
});

test('no cookie is signed out, and still needs no network call', () => {
  const state = sessionStateFrom(reader({}), URL_, 1_800_000_000);
  assert.equal(state.kind, 'signed-out');
});

test('an expired token asks Supabase', () => {
  const now = 1_800_000_000;
  const jar = { [KEY]: cookieFor({ access_token: tokenExpiring(now - 1) }) };
  const state = sessionStateFrom(reader(jar), URL_, now);
  assert.deepEqual(state, { kind: 'needs-supabase', reason: 'expired' });
});

test('a token inside the refresh margin asks Supabase before it expires', () => {
  const now = 1_800_000_000;
  const jar = { [KEY]: cookieFor({ access_token: tokenExpiring(now + REFRESH_MARGIN_SECONDS - 1) }) };
  assert.equal(sessionStateFrom(reader(jar), URL_, now).kind, 'needs-supabase');
});

test('a cookie we cannot read asks Supabase rather than guessing signed-out', () => {
  // Guessing the other way would bounce a signed-in person to /login, which
  // is the failure people actually notice.
  const jar = { [KEY]: 'base64-@@@not-base64@@@' };
  assert.deepEqual(sessionStateFrom(reader(jar), URL_, 1_800_000_000), {
    kind: 'needs-supabase',
    reason: 'unreadable',
  });
});

test('middleware never calls getUser() unconditionally', () => {
  /*
    The guard. This is the whole performance fix, and it is one `if` away
    from being undone by a well-meaning edit — reverting it leaves every test
    passing and every page 2.4 seconds slower.
  */
  const source = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf8');
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  assert.match(
    withoutComments,
    /sessionStateFrom\(/,
    'middleware must read the session out of the cookie first'
  );

  const getUserLine = withoutComments
    .split('\n')
    .findIndex((l) => l.includes('supabase.auth.getUser()'));
  assert.ok(getUserLine > -1, 'expected middleware to still be able to refresh');

  const guardLine = withoutComments
    .split('\n')
    .findIndex((l) => l.includes("state.kind === 'needs-supabase'"));
  assert.ok(guardLine > -1, 'getUser() must sit behind a needs-supabase check');
  assert.ok(guardLine < getUserLine, 'the needs-supabase check must come before getUser()');
});

test('a dead session is cleared rather than retried forever', () => {
  /*
    An expired token that will not refresh costs the full deadline on every
    request, and the next request finds the same dead cookie and pays again.
    Clearing it turns an endless loop into one sign-in. Only for `expired` —
    signing somebody out because Supabase wobbled would be its own bug.
  */
  const source = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf8');
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  assert.match(
    withoutComments,
    /state\.reason === 'expired'[\s\S]{0,200}clearedSession\(/,
    'an expired-and-unrefreshable session must be cleared'
  );
  assert.match(
    withoutComments,
    /maxAge:\s*0/,
    'clearing must actually expire the cookie, not just blank it'
  );

  assert.match(
    withoutComments,
    /startsWith\('sb-'\)/,
    'every Supabase session cookie must be cleared, chunked ones included'
  );
});

test('the refresh deadline leaves room for a refresh to actually land', () => {
  /*
    It was 2500ms, and a refresh took about 2500ms — so the response went out
    a fraction before Supabase answered and the fresh cookie was dropped,
    every time, which is why one session sat fifteen hours past expiry while
    Supabase logged a successful token_refreshed for every page load.
  */
  const source = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf8');
  const match = source.match(/AUTH_DEADLINE_MS\s*=\s*(\d+)/);
  assert.ok(match, 'expected a named deadline');
  const ms = Number(match![1]);
  assert.ok(ms >= 5000, `deadline ${ms}ms is too tight for a refresh to come back`);
  assert.ok(ms <= 20000, `deadline ${ms}ms risks the 25s middleware ceiling`);
});
