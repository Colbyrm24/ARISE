import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daySections,
  eatenTotals,
  fillPercent,
  headline,
  loggedNameSet,
  slotOf,
  type LoggedEntry,
} from '../nutrition-day';
import type { PlanItem } from '../nutrition-day';

function log(over: Partial<LoggedEntry> = {}): LoggedEntry {
  return {
    id: Math.random().toString(36).slice(2),
    meal: 'lunch',
    name: 'Chicken and rice',
    calories: 500,
    protein: 45,
    carbs: 50,
    fat: 12,
    photoPath: null,
    reviewState: null,
    ...over,
  };
}

function planItem(over: Partial<PlanItem> = {}): PlanItem {
  return {
    id: Math.random().toString(36).slice(2),
    meal: 'lunch',
    name: 'Chicken and rice',
    quantity: 1,
    calories: 500,
    protein: 45,
    carbs: 50,
    fat: 12,
    note: null,
    recipeId: null,
    ...over,
  };
}

test('the headline counts down, and flips to over when the budget is gone', () => {
  assert.deepEqual(headline(1760, 3000), { kind: 'left', amount: 1240 });
  assert.deepEqual(headline(3240, 3000), { kind: 'over', amount: 240 });
  // Landing exactly on it is "0 left", not "0 over" — nobody has overeaten.
  assert.deepEqual(headline(3000, 3000), { kind: 'left', amount: 0 });
});

test('with no target there is nothing to be left of', () => {
  assert.deepEqual(headline(1200, null), { kind: 'untargeted', amount: 1200 });
  assert.deepEqual(headline(1200, 0), { kind: 'untargeted', amount: 1200 });
});

test('the bar cannot draw past its own end', () => {
  assert.equal(fillPercent(1500, 3000), 50);
  assert.equal(fillPercent(9000, 3000), 100);
  assert.equal(fillPercent(-40, 3000), 0);
  assert.equal(fillPercent(500, null), 0);
});

test('an unslotted entry lands in Snack rather than disappearing', () => {
  assert.equal(slotOf(null), 'snack');
  assert.equal(slotOf(''), 'snack');
  assert.equal(slotOf('elevenses'), 'snack');
  assert.equal(slotOf('breakfast'), 'breakfast');
});

test('meals come back in eating order, and empty ones are dropped', () => {
  const sections = daySections(
    [planItem({ meal: 'dinner', name: 'Steak' })],
    [log({ meal: 'breakfast', name: 'Eggs', calories: 300, protein: 24 })]
  );
  assert.deepEqual(
    sections.map((s) => s.slot),
    ['breakfast', 'dinner']
  );
  // Lunch had neither a plan line nor a log, so it isn't a heading.
  assert.equal(sections.some((s) => s.slot === 'lunch'), false);
});

test('a meal totals what was eaten, not what was planned', () => {
  const [lunch] = daySections(
    [planItem({ calories: 700, protein: 60 })],
    [log({ calories: 480, protein: 44 }), log({ calories: 120, protein: 2, name: 'Coke' })]
  );
  assert.equal(lunch!.calories, 600);
  assert.equal(lunch!.protein, 46);
  // The plan's own number is kept alongside so the meal can be compared.
  assert.equal(lunch!.plannedCalories, 700);
});

test('a planned line counts as eaten when it was logged under any other name casing', () => {
  const eaten = loggedNameSet([{ name: '  Chicken And Rice ' }, { name: '' }]);
  assert.equal(eaten.has('chicken and rice'), true);
  assert.equal(eaten.size, 1, 'a blank name should not become an entry that matches nothing');
});

test('totals add up across every meal at once', () => {
  const totals = eatenTotals([
    log({ calories: 300, protein: 24, carbs: 10, fat: 18 }),
    log({ calories: 500, protein: 45, carbs: 50, fat: 12 }),
  ]);
  assert.deepEqual(totals, { calories: 800, protein: 69, carbs: 60, fat: 30 });
});
