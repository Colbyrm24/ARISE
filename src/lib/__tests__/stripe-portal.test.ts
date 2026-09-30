import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
  A client cannot cancel their own coaching plan.

  Not a style preference — it is the commercial shape of the product. Plans
  here are sold with a term, a payment count and a contract total, printed on
  an agreement the client signs. A self-serve cancel button quietly turns all
  of that into a rolling monthly nobody agreed to.

  The trap is that this is an absence, not a feature. Nothing in the app is
  labelled "cancel"; the exposure is that opening a Stripe portal session
  WITHOUT naming a configuration uses the account default, and Stripe's
  default has cancellation switched on. So the bug looks like ordinary,
  correct-reading code — three lines that open a portal — and the only way to
  notice is to know what the missing argument does.

  These tests are the note-to-self about that.
*/

const root = join(import.meta.dirname, '../../..');
const portal = readFileSync(join(root, 'src/lib/stripe-portal.ts'), 'utf8');
const route = readFileSync(join(root, 'src/app/api/billing-portal/route.ts'), 'utf8');

/** Strip comments — this codebase explains itself at length, and the word
    "cancel" appears in prose far more often than in code. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('the portal configuration disables subscription cancellation', () => {
  assert.match(
    code(portal),
    /subscription_cancel:\s*\{\s*enabled:\s*false\s*[,}]/,
    'stripe-portal.ts must set subscription_cancel.enabled = false. Leaving it out ' +
      'is not neutral — Stripe enables cancellation by default.'
  );
});

test('the portal configuration disables self-serve plan changes', () => {
  assert.match(
    code(portal),
    /subscription_update:\s*\{\s*enabled:\s*false\s*[,}]/,
    'stripe-portal.ts must set subscription_update.enabled = false — switching plan ' +
      'or price is the same decision as cancelling, taken a different way.'
  );
});

test('the portal is never opened on the Stripe account default', () => {
  const body = code(route);
  assert.match(
    body,
    /arisePortalConfigurationId\(/,
    'billing-portal/route.ts must resolve ARISE\'s own portal configuration.'
  );
  assert.match(
    body,
    /billingPortal\.sessions\.create\(\{[^}]*configuration/,
    'The portal session must pass `configuration`. Without it Stripe uses the ' +
      'account default, which lets a client cancel their own plan.'
  );
});

test('no client-facing route creates a portal session of its own', () => {
  /*
    One door. A second caller that opens its own session is how the
    configuration above gets bypassed six months from now by somebody who
    never read this file.
  */
  const { execSync } = require('node:child_process') as typeof import('node:child_process');
  const hits = execSync(
    // --exclude-dir=__tests__: this file names the call in order to guard it.
    `grep -rl --exclude-dir=__tests__ "billingPortal.sessions.create" ${JSON.stringify(join(root, 'src'))} || true`,
    { encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean);

  assert.deepEqual(
    hits.map((h) => h.replace(root + '/', '')),
    ['src/app/api/billing-portal/route.ts'],
    'Portal sessions must be created in exactly one place, so the locked-down ' +
      'configuration cannot be skipped.'
  );
});
