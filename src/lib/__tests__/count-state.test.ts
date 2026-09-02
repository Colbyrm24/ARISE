/*
  The bracket that tells a client whether they landed on a number.

  Two things decide what it says: countState, which is the rule, and
  numericPart, which is what the rule gets handed. The rule was always right
  and the input was not — Count accepts a string for `total` so a caller can
  write "185g", and that string went straight into Number(), which is NaN.
  countState bails to 'none' on a non-finite total, and 'none' is styled the
  same as 'short', so the protein bracket looked identical at 20g eaten and
  at 190g against a 185g goal. The signal could never fire.

  Same shape as Number("12,000 steps"), which has shipped here before. So the
  parsing gets its own tests, not just the rule.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { countState, numericPart } from '@/components/ui/system-window';

test('numericPart keeps a plain number as it is', () => {
  assert.equal(numericPart(185), 185);
  assert.equal(numericPart(0), 0);
  assert.equal(numericPart(-3), -3);
});

test('numericPart digs the number out of a unit-suffixed string', () => {
  assert.equal(numericPart('185g'), 185);
  assert.equal(numericPart('8.2'), 8.2);
  assert.equal(numericPart('12,000 steps'), 12000);
});

test('numericPart is undefined for a string with no number in it', () => {
  assert.equal(numericPart('—'), undefined);
  assert.equal(numericPart(''), undefined);
  assert.equal(numericPart(undefined), undefined);
});

test('a protein goal written as "185g" now reaches the rule as 185', () => {
  // The exact regression: reach mode, goal carried as a display string.
  assert.equal(countState(190, numericPart('185g'), 'reach'), 'landed');
  assert.equal(countState(20, numericPart('185g'), 'reach'), 'short');
});

test('reach mode lands on the goal and stays short below it', () => {
  assert.equal(countState(185, 185, 'reach'), 'landed');
  assert.equal(countState(184, 185, 'reach'), 'short');
  assert.equal(countState(400, 185, 'reach'), 'landed', 'beating a floor is never over');
});

test('budget mode flags an overshoot but tolerates the error bars', () => {
  assert.equal(countState(2000, 2000, 'budget'), 'landed');
  // 5% of a 2,000 target is 100 calories, inside any estimate's error.
  assert.equal(countState(2100, 2000, 'budget'), 'landed');
  assert.equal(countState(2101, 2000, 'budget'), 'over');
  assert.equal(countState(1500, 2000, 'budget'), 'short');
});

test('no goal, or a nonsense one, stays neutral rather than claiming a win', () => {
  assert.equal(countState(190, undefined, 'reach'), 'none');
  assert.equal(countState(190, 0, 'reach'), 'none');
  assert.equal(countState(190, NaN, 'reach'), 'none');
  assert.equal(countState(190, numericPart('—'), 'reach'), 'none');
});
