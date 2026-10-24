import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
  Every table that holds a person's data has to be named in the deletion.

  This is the one bug in account deletion that cannot be caught by types, by a
  code review, or by trying it: somebody adds a table six months from now —
  sleep_logs, mood_logs, whatever — wires it to Client, ships it, and
  lib/delete-account.ts goes on not mentioning it. Deletion keeps "working".
  The rows just quietly survive it, and a promise on the privacy page becomes
  false with nothing anywhere going red.

  So this reads the schema, finds every model that points at a User or a
  Client, and insists that each one is accounted for in exactly one of three
  ways: deleted outright, cascaded from something that is deleted, or listed
  below as a deliberate keep with a reason. Adding a table now means choosing
  one, which is the whole point.
*/

const root = join(import.meta.dirname, '../../..');
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
const deleter = readFileSync(join(root, 'src/lib/delete-account.ts'), 'utf8');

/** model name -> body */
function models(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of src.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) out.set(m[1], m[2]);
  return out;
}

const ALL = models(schema);

/** `Foo` -> `foo`, `WeightLog` -> `weightLog`: how Prisma names the delegate. */
const delegate = (model: string) => model[0].toLowerCase() + model.slice(1);

/*
  Tables kept on purpose, each with the reason it is kept.

  Financial and contractual records, plus the two stub rows they hang off.
  A table only belongs here if deleting it would destroy a record ARISE is
  obliged to be able to produce later — not because deleting it is awkward.
*/
const KEPT: Record<string, string> = {
  Payment: 'financial record; tax and accounting retention',
  Subscription: 'billing record — schema says soft delete only',
  PaymentLink: 'the terms a subscription was sold on',
  Agreement: 'signed contract',
  AgreementSignature: 'the evidence the contract was signed',
  Client: 'stripped stub; the row the invoices point at',
  User: 'stripped stub; tombstoned email, no personal data left',
  /*
    Coach-owned library and settings. These reference User, but the User they
    reference is the coach — deleting a client must not take the coach's
    exercise templates or working hours with it.
  */
  WorkoutTemplate: 'coach-owned template library',
  CardioType: 'coach-owned cardio library',
  AutoMessage: 'coach-owned automation',
  Recipe: 'coach-owned recipe library',
  CoachAvailability: "the coach's own working hours",
  ProgramOffer: "the coach's Follow My Split page",
  ClientInvite: "coach's record of an invite; the client's name is nulled",
  AuditLog: 'kept as a record of the action, with the actor detached',
};

/** Models whose rows disappear when a parent this code deletes is deleted. */
function cascadesFrom(model: string): string | null {
  const body = ALL.get(model);
  if (!body) return null;
  for (const r of body.matchAll(/^\s+\w+\s+(\w+)\??\s+@relation\((.*?)\)/gm)) {
    if (r[2].includes('Cascade')) return r[1];
  }
  return null;
}

/** True when this model, or a chain of cascades above it, is deleted. */
function accountedFor(model: string, seen = new Set<string>()): boolean {
  if (seen.has(model)) return false;
  seen.add(model);
  if (new RegExp(`\\btx\\.${delegate(model)}\\.deleteMany\\b`).test(deleter)) return true;
  const parent = cascadesFrom(model);
  return parent ? accountedFor(parent, seen) : false;
}

test('every model pointing at a User or Client is deleted, cascaded, or a declared keep', () => {
  const unhandled: string[] = [];

  for (const [name, body] of ALL) {
    const touchesPerson = [...body.matchAll(/^\s+\w+\s+(User|Client)\??\s+@relation/gm)].length > 0;
    if (!touchesPerson) continue;
    if (name in KEPT) continue;
    if (accountedFor(name)) continue;
    unhandled.push(name);
  }

  assert.deepEqual(
    unhandled,
    [],
    `These models hold data tied to a person but survive account deletion:\n  ${unhandled.join('\n  ')}\n\n` +
      'Either delete them in src/lib/delete-account.ts, give them onDelete: Cascade ' +
      'from something that is deleted, or add them to KEPT in this test with the reason.'
  );
});

test('the keep list does not name a model that no longer exists', () => {
  const stale = Object.keys(KEPT).filter((m) => !ALL.has(m));
  assert.deepEqual(stale, [], `KEPT names models that are gone from the schema: ${stale.join(', ')}`);
});

test('billing records are never hard-deleted', () => {
  /*
    The specific mistake this guards: somebody reading the function decides the
    stub rows are untidy and "finishes the job". Payment and Subscription are
    the two that would take real money records with them.
  */
  for (const model of ['payment', 'subscription', 'paymentLink', 'agreement']) {
    assert.ok(
      !new RegExp(`\\btx\\.${model}\\.deleteMany\\b`).test(deleter),
      `delete-account.ts deletes ${model} rows. Billing and contract records are kept — ` +
        'see the comment at the top of that file.'
    );
  }
});

test('files are collected before rows are deleted', () => {
  /*
    Order, not presence. The rows are the only index of which objects in the
    bucket belong to this person, so collecting after deleting leaves files
    that nothing can ever find again — and the deletion reports success.
  */
  const collect = deleter.indexOf('const plan = await collectFiles');
  const erase = deleter.indexOf('prisma.$transaction');
  const remove = deleter.indexOf('await removeFiles(plan)');

  assert.ok(collect > 0 && erase > 0 && remove > 0, 'expected the three steps to be present');
  assert.ok(collect < erase, 'collectFiles must run before the deleting transaction');
  assert.ok(erase < remove, 'removeFiles must run after the rows are gone');
});

test('the sign-in identity is deleted after the data, not before', () => {
  /*
    The other order locks somebody out of an account that still holds all of
    their data — they cannot sign in, and they cannot finish deleting.
  */
  const action = readFileSync(
    join(root, 'src/app/(client)/profile/delete-actions.ts'),
    'utf8'
  );
  const erase = action.indexOf('eraseClientData');
  const auth = action.indexOf('deleteAuthIdentity(');
  assert.ok(erase > 0 && auth > 0, 'expected both calls in the delete action');
  assert.ok(erase < auth, 'eraseClientData must run before deleteAuthIdentity');
});
