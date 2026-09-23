/*
  The macro split, which is the one number on this card the coach no longer
  checks by hand. If it drifts, nobody notices until a client has been eating
  to it for a fortnight.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { balancedMacros } from '@/lib/macros';

test('a real target splits 30/40/30 by calories', () => {
  const m = balancedMacros(2400);
  assert.deepEqual(m, { protein: 180, carbs: 240, fat: 80 });
});

test('the grams add back up to the calories they came from', () => {
  for (const calories of [1200, 1850, 2000, 2400, 3175]) {
    const m = balancedMacros(calories);
    assert.ok(m, `no macros for ${calories}`);
    const total = m.protein * 4 + m.carbs * 4 + m.fat * 9;
    // Rounding to whole grams can only move this a few calories either way.
    assert.ok(
      Math.abs(total - calories) <= 6,
      `${calories} cal produced ${total} cal of macros`
    );
  }
});

test('nothing is filled in for a number that is not a target', () => {
  /*
    The half-typed case is the one that matters. A coach typing "2400" passes
    through 2, 24 and 240 — filling on every keystroke is fine, but filling on
    an empty or unreadable box would stamp zeros over numbers he already set.
  */
  assert.equal(balancedMacros(0), null);
  assert.equal(balancedMacros(-500), null);
  assert.equal(balancedMacros(Number.NaN), null);
  assert.equal(balancedMacros(Number.POSITIVE_INFINITY), null);
});

test('a partly typed number still produces something sane', () => {
  assert.deepEqual(balancedMacros(2), { protein: 0, carbs: 0, fat: 0 });
  assert.deepEqual(balancedMacros(240), { protein: 18, carbs: 24, fat: 8 });
});
