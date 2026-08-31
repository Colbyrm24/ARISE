/*
  Which photo gets held up against which.

  The failure that matters is silent: pair the wrong two and the client sees
  a "then and now" that flatters or insults them for no reason, and nothing
  in the UI says anything is wrong.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePairs, spanLabel, type ComparePhoto } from '@/lib/photo-compare';

const d = (iso: string) => new Date(iso + 'T00:00:00Z');
const photo = (over: Partial<ComparePhoto> & { id: string }): ComparePhoto => ({
  date: d('2026-01-01'),
  angle: 'front',
  url: 'signed',
  ...over,
});

test('each angle pairs its earliest with its most recent', () => {
  const early = [
    photo({ id: 'f1', angle: 'front', date: d('2026-02-01') }),
    photo({ id: 'b1', angle: 'back', date: d('2026-02-01') }),
  ];
  const late = [
    photo({ id: 'f9', angle: 'front', date: d('2026-08-01') }),
    photo({ id: 'b9', angle: 'back', date: d('2026-08-01') }),
  ];
  const pairs = comparePairs(early, late);
  assert.deepEqual(
    pairs.map((p) => [p.angle, p.first.id, p.latest.id]),
    [
      ['front', 'f1', 'f9'],
      ['back', 'b1', 'b9'],
    ]
  );
});

test('angles come back in a fixed order, not the query order', () => {
  // Otherwise the row reshuffles between visits for no reason the client can see.
  const early = [
    photo({ id: 'b1', angle: 'back', date: d('2026-01-01') }),
    photo({ id: 's1', angle: 'side', date: d('2026-01-01') }),
    photo({ id: 'f1', angle: 'front', date: d('2026-01-01') }),
  ];
  const late = [
    photo({ id: 'b2', angle: 'back', date: d('2026-06-01') }),
    photo({ id: 's2', angle: 'side', date: d('2026-06-01') }),
    photo({ id: 'f2', angle: 'front', date: d('2026-06-01') }),
  ];
  assert.deepEqual(comparePairs(early, late).map((p) => p.angle), ['front', 'side', 'back']);
});

test('an angle with only one shoot is skipped', () => {
  // Comparing a photo against itself is a mirror, not progress.
  const only = [photo({ id: 'f1', angle: 'front', date: d('2026-03-01') })];
  assert.deepEqual(comparePairs(only, only), []);
});

test('an angle photographed once at the start and never again is skipped', () => {
  const early = [photo({ id: 'sideOnce', angle: 'side', date: d('2026-01-01') })];
  const late = [photo({ id: 'f9', angle: 'front', date: d('2026-08-01') })];
  assert.deepEqual(comparePairs(early, late), []);
});

test('order within each list is not trusted', () => {
  // The caller sorts desc for one query and asc for the other; this must not
  // depend on remembering which is which.
  const early = [
    photo({ id: 'mid', angle: 'front', date: d('2026-04-01') }),
    photo({ id: 'oldest', angle: 'front', date: d('2026-01-01') }),
  ];
  const late = [
    photo({ id: 'newest', angle: 'front', date: d('2026-09-01') }),
    photo({ id: 'mid2', angle: 'front', date: d('2026-07-01') }),
  ];
  const [pair] = comparePairs(early, late);
  assert.equal(pair.first.id, 'oldest');
  assert.equal(pair.latest.id, 'newest');
});

test('the gap is counted in whole days', () => {
  const early = [photo({ id: 'a', date: d('2026-01-01') })];
  const late = [photo({ id: 'b', date: d('2026-03-01') })];
  assert.equal(comparePairs(early, late)[0].daysApart, 59);
});

// --- how the gap is said out loud
test('short gaps stay in days', () => {
  assert.equal(spanLabel(1), '1 day apart');
  assert.equal(spanLabel(9), '9 days apart');
});

test('training blocks are counted in weeks', () => {
  assert.equal(spanLabel(14), '2 weeks apart');
  assert.equal(spanLabel(84), '12 weeks apart');
  assert.equal(spanLabel(7 * 1 + 7), '2 weeks apart');
});

test('past a year it reads as years', () => {
  assert.equal(spanLabel(365), '1 year apart');
  assert.equal(spanLabel(365 + 90), '1y 3m apart');
});
