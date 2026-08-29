import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
  Who gets the paid product, and what the people who don't are told.

  `isEntitled` lives in @/lib/auth, which pulls in Supabase and next/headers
  and can't be imported by a bare node test — so the set is read out of the
  source. That's uglier than importing it and it is worth it: this one line
  decides whether somebody whose card died keeps training for free, and it
  had the wrong value in it for months.
*/

const authSrc = readFileSync(join(process.cwd(), 'src/lib/auth.ts'), 'utf8');
const statusSrc = readFileSync(join(process.cwd(), 'src/lib/client-status.ts'), 'utf8');

const entitled = (() => {
  const m = /const ENTITLED = new Set\(\[([^\]]*)\]\)/.exec(authSrc);
  assert.ok(m, 'could not find the ENTITLED set in src/lib/auth.ts');
  return m[1]!
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
})();

/** Every status a client row can hold, straight from the schema enum. */
const allStatuses = (() => {
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const m = /enum ClientStatus \{([^}]*)\}/.exec(schema);
  assert.ok(m, 'could not find the ClientStatus enum');
  return m[1]!
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
})();

test('a paused client does not keep the paid product', () => {
  // This is the whole point of the pause: a dead card, an exhausted retry
  // schedule or a cancelled subscription moves somebody to `paused`, and if
  // `paused` grants access then none of that billing code does anything.
  assert.equal(
    entitled.includes('paused'),
    false,
    'paused must not be entitled — the billing code pauses people expecting it to remove access'
  );
});

test('nobody is entitled before they have paid', () => {
  for (const s of ['lead', 'payment_pending', 'paid', 'agreement_pending', 'cancelled']) {
    assert.equal(entitled.includes(s), false, `${s} must not have access to the paid product`);
  }
});

test('a client being coached keeps access', () => {
  for (const s of ['onboarding', 'active', 'ending_soon']) {
    assert.equal(entitled.includes(s), true, `${s} is an active coaching state and must have access`);
  }
});

test('every locked-out status tells the client what is happening', () => {
  // Somebody bounced to /welcome sees STATUS_WAITING[status]. A status with
  // no entry there falls back to the `lead` copy — "You're on the list" —
  // which is actively wrong for a person whose payment just failed.
  for (const status of allStatuses) {
    if (entitled.includes(status)) continue;
    assert.match(
      statusSrc,
      new RegExp(`^\\s{2}${status}: \\{`, 'm'),
      `${status} locks the client out but has no STATUS_WAITING copy, so they'd be shown the "you're on the list" message`
    );
  }
});
