import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  repsLabel,
  weightLabel,
  restLabel,
  setTypeLabel,
  describeSet,
  summarise,
  parseLoggedWeight,
  parseLoggedReps,
  MAX_LOGGED_WEIGHT,
  MAX_LOGGED_REPS,
  type SetShape,
} from '../set-prescription';

/*
  The thing being pinned down here is that a number on this screen never
  appears without saying what it counts. "12 × 95" was on the screen a client
  trains from for months and could as easily have meant twelve sets.
*/

const set = (over: Partial<SetShape> = {}): SetShape => ({
  type: 'working',
  targetReps: '6-8',
  targetWeight: 95,
  restSeconds: 90,
  ...over,
});

test('a rep range keeps its range and gains its unit', () => {
  assert.equal(repsLabel('6-8'), '6–8 reps');
  assert.equal(repsLabel(' 8 - 10 '), '8–10 reps');
  assert.equal(repsLabel('12'), '12 reps');
  assert.equal(repsLabel('1'), '1 rep');
});

test("a coach's words are left as a coach wrote them", () => {
  // "to failure reps" would be the bug.
  assert.equal(repsLabel('to failure'), 'to failure');
  assert.equal(repsLabel('AMRAP'), 'AMRAP');
  assert.equal(repsLabel(''), null);
  assert.equal(repsLabel(null), null);
});

test('weight carries its unit and drops fake precision', () => {
  assert.equal(weightLabel(95), '95 lb');
  assert.equal(weightLabel(102.5), '102.5 lb');
  assert.equal(weightLabel(null), null);
  assert.equal(weightLabel(0), null);
});

test('rest is expressed in the units a person counts in', () => {
  assert.equal(restLabel(90), '90s rest');
  assert.equal(restLabel(119), '119s rest');
  assert.equal(restLabel(120), '2m rest');
  assert.equal(restLabel(150), '2m 30s rest');
  assert.equal(restLabel(300), '5m rest');
  assert.equal(restLabel(null), null);
  assert.equal(restLabel(0), null);
});

test('only the sets that are different get a tag', () => {
  // Labelling every ordinary set "WORKING" buries the two that matter.
  assert.equal(setTypeLabel('working'), null);
  assert.equal(setTypeLabel('warmup'), 'Warm-up');
  assert.equal(setTypeLabel('drop'), 'Drop set');
});

test('a set reads as reps, then weight, then rest', () => {
  assert.deepEqual(describeSet(set()), ['6–8 reps', '95 lb', '90s rest']);
});

test('missing parts drop out rather than leaving gaps', () => {
  assert.deepEqual(describeSet(set({ targetWeight: null, restSeconds: null })), ['6–8 reps']);
  assert.deepEqual(describeSet(set({ targetReps: null, targetWeight: null, restSeconds: null })), []);
});

test('the headline answers how many sets of how many reps', () => {
  const s = summarise([set(), set(), set()]);
  assert.equal(s.headline, '3 sets · 6–8 reps · 95 lb');
  assert.equal(s.working, 3);
});

test("Colby's own shape — two working sets and a drop — says so", () => {
  const s = summarise([set(), set(), set({ type: 'drop' })]);
  assert.equal(s.working, 2);
  assert.equal(s.drop, 1);
  assert.match(s.headline, /^2 sets \+ 1 drop/);
});

test('warm-ups are counted separately from the work', () => {
  const s = summarise([set({ type: 'warmup' }), set(), set()]);
  assert.equal(s.warmup, 1);
  assert.equal(s.working, 2);
  assert.match(s.headline, /2 sets · 1 warm-up/);
});

test('a headline never quotes one set as if it were all of them', () => {
  // Different weights across the working sets, so the weight belongs on the
  // rows, not on the summary line.
  const s = summarise([set({ targetWeight: 95 }), set({ targetWeight: 115 })]);
  assert.equal(s.weight, null);
  assert.equal(s.headline, '2 sets · 6–8 reps');

  const r = summarise([set({ targetReps: '6-8' }), set({ targetReps: '10-12' })]);
  assert.equal(r.reps, null);
  assert.equal(r.headline, '2 sets · 95 lb');
});

test('an untyped program still gets a sensible line', () => {
  // Seeded programs that never set a type must not read "0 sets".
  const s = summarise([set({ type: 'warmup' }), set({ type: 'warmup' })]);
  assert.match(s.headline, /^2 sets/);
});

test('no sets at all is empty, not a lie', () => {
  assert.equal(summarise([]).headline, '');
});

/*
  The logger's two boxes. Every case here is something that reached the
  database, or reached Postgres and threw, before these existed.
*/

test('an ordinary set is read as typed', () => {
  assert.equal(parseLoggedWeight('225'), 225);
  assert.equal(parseLoggedReps('8'), 8);
  assert.equal(parseLoggedWeight('102.5'), 102.5);
});

test('the typo that used to crash the screen mid-session', () => {
  /*
    22555 instead of 225 on a phone number pad. actual_weight is
    Decimal(6,2), so Postgres rejected it, the server action threw, and with
    no error boundary above it the client lost the whole workout screen to a
    generic error page. Rejected here instead, and rejected as `undefined`
    so the value already recorded is left alone.
  */
  assert.equal(parseLoggedWeight('22555'), undefined);
  assert.equal(parseLoggedWeight(String(MAX_LOGGED_WEIGHT + 1)), undefined);
  assert.equal(parseLoggedReps(String(MAX_LOGGED_REPS + 1)), undefined);
});

test('the boundary itself is allowed', () => {
  assert.equal(parseLoggedWeight(String(MAX_LOGGED_WEIGHT)), MAX_LOGGED_WEIGHT);
  assert.equal(parseLoggedReps(String(MAX_LOGGED_REPS)), MAX_LOGGED_REPS);
});

test('a negative weight is refused, not stored', () => {
  // It stored fine and made total_volume negative, which dragged the
  // client's entire volume trend down with it.
  assert.equal(parseLoggedWeight('-500'), undefined);
  assert.equal(parseLoggedReps('-3'), undefined);
});

test('junk and NaN change nothing rather than wiping the row', () => {
  assert.equal(parseLoggedWeight('abc'), undefined);
  assert.equal(parseLoggedWeight('NaN'), undefined);
  assert.equal(parseLoggedWeight('Infinity'), undefined);
  assert.equal(parseLoggedWeight('1e99'), undefined);
});

test('an empty box means the client cleared it', () => {
  /*
    The distinction the old code could not make. `?? undefined` treated a
    blanked box as an absent field, Prisma skipped it, and the wrong weight
    stayed on the row with no way to remove it.
  */
  assert.equal(parseLoggedWeight(''), null);
  assert.equal(parseLoggedWeight('   '), null);
  assert.equal(parseLoggedReps(''), null);
});

test('an absent field is not a cleared one', () => {
  assert.equal(parseLoggedWeight(null), undefined);
  assert.equal(parseLoggedWeight(undefined), undefined);
});

test('zero is a real value, not an empty box', () => {
  // Bodyweight sets are logged at 0, and 0 must not read as "no answer".
  assert.equal(parseLoggedWeight('0'), 0);
  assert.equal(parseLoggedReps('0'), 0);
});

test('reps are whole; weight keeps half-pound plates', () => {
  assert.equal(parseLoggedReps('8.6'), 9);
  assert.equal(parseLoggedWeight('102.567'), 102.57);
  assert.equal(parseLoggedWeight('47.5'), 47.5);
});
