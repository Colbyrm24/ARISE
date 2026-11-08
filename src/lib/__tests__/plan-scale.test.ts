import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleFactor, resizeLine, typicalDay, servingsLabel, quarter } from '../plan-scale';

test('factor rounds to quarters and stays in bounds', () => {
  assert.equal(scaleFactor(2600, 2600), 1);
  assert.equal(scaleFactor(3200, 2600), 1.25);
  assert.equal(scaleFactor(2000, 2600), 0.75);
  assert.equal(scaleFactor(800, 2600), 0.5);
  assert.equal(scaleFactor(20000, 2600), 3);
});

test('missing numbers leave the plan alone', () => {
  assert.equal(scaleFactor(null, 2600), 1);
  assert.equal(scaleFactor(2400, 0), 1);
  assert.equal(scaleFactor(Number.NaN, 2600), 1);
});

test('a resized line keeps servings and macros in step', () => {
  const r = resizeLine({ quantity: 1, calories: 600, protein: 45, carbs: 60, fat: 20 }, 1.25);
  assert.deepEqual(r, { quantity: 1.25, calories: 750, protein: 56.3, carbs: 75, fat: 25 });
});

test('macros follow the rounded quantity, not the raw factor', () => {
  // 1.5 × 0.9 = 1.35 → 1.25 servings, so calories are 1.25/1.5 of the line.
  const r = resizeLine({ quantity: 1.5, calories: 900, protein: 60, carbs: 90, fat: 30 }, 0.9);
  assert.equal(r.quantity, 1.25);
  assert.equal(r.calories, 750);
});

test('never below a quarter serving', () => {
  assert.equal(resizeLine({ quantity: 0.25, calories: 100, protein: 5, carbs: 10, fat: 3 }, 0.5).quantity, 0.25);
});

test('a typical day averages the options under each meal', () => {
  const lines = [
    { meal: 'breakfast', calories: 500 },
    { meal: 'breakfast', calories: 700 },
    { meal: 'lunch', calories: 800 },
    { meal: 'dinner', calories: 900 },
    { meal: 'dinner', calories: 1100 },
  ];
  assert.equal(typicalDay(lines), 600 + 800 + 1000);
});

test('servings read like a person would say them', () => {
  assert.equal(servingsLabel(1), '1 serving');
  assert.equal(servingsLabel(1.25), '1¼ servings');
  assert.equal(servingsLabel(0.5), '½ serving');
  assert.equal(servingsLabel(2), '2 servings');
  assert.equal(servingsLabel(2.75), '2¾ servings');
  assert.equal(quarter(1.13), 1.25);
});
