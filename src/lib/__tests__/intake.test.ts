/*
  Whether the intake is finished — the check that decides if somebody becomes
  an active client or sits one status short of it forever.

  The old version of this counted completed rows against "steps with a
  required field", which is three of the four. Filling the fieldless step
  first hit the count early and told the coach the intake was done when it
  wasn't; filling all four made the count four against three, and it never
  fired at all.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { allStepsDone, ONBOARDING_STEPS } from '@/lib/onboarding';

const ALL = ONBOARDING_STEPS.map((s) => s.key);

test('every step answered is a finished intake', () => {
  assert.equal(allStepsDone(ALL), true);
});

test('one step short is not a finished intake', () => {
  assert.equal(allStepsDone(ALL.slice(0, -1)), false);
});

test('nothing answered is not a finished intake', () => {
  assert.equal(allStepsDone([]), false);
});

test('the count alone cannot satisfy it', () => {
  // Repeats, or keys from a step that no longer exists, must not add up to a
  // completed intake the way a bare row count did.
  assert.equal(allStepsDone([ALL[0], ALL[0], ALL[0], ALL[0], 'gone']), false);
});

test('a step answered twice does not break a genuinely complete intake', () => {
  assert.equal(allStepsDone([...ALL, ALL[0], 'retired_step']), true);
});
