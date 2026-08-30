import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTarget } from '../habits';

/*
  A coach types targets into a free-text box, so every numeric habit has to
  dig its number back out of prose. The bug worth pinning down is the quiet
  one: "10k" became 10, which is a step goal a client clears before getting
  out of bed and which reads as landed all day.
*/

test('digits come out of prose', () => {
  assert.equal(parseTarget('12,000 steps'), 12000);
  assert.equal(parseTarget('180g protein'), 180);
  assert.equal(parseTarget('2000'), 2000);
  assert.equal(parseTarget(' 7 hours '), 7);
});

test('k means thousand, not the digit before it', () => {
  assert.equal(parseTarget('10k'), 10000);
  assert.equal(parseTarget('10K steps'), 10000);
  assert.equal(parseTarget('12.5k'), 12500);
  assert.equal(parseTarget('8 k'), 8000);
});

test('nothing usable returns nothing rather than a wrong number', () => {
  assert.equal(parseTarget(null), undefined);
  assert.equal(parseTarget(undefined), undefined);
  assert.equal(parseTarget(''), undefined);
  assert.equal(parseTarget('   '), undefined);
  assert.equal(parseTarget('as many as you can'), undefined);
  assert.equal(parseTarget('0'), undefined);
});

test('a decimal target survives', () => {
  assert.equal(parseTarget('1.5 gallons'), 1.5);
});
