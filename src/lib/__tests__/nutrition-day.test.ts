import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayRange,
  daySections,
  eatenTotals,
  fillPercent,
  formatRange,
  headline,
  loggedNameSet,
  nextOpenSlot,
  rangeOf,
  rangeVerdict,
  slotOf,
  wholeDaySync,
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
  assert.deepEqual(lunch!.plannedCalories, { min: 700, max: 700 });
});

test('seven breakfasts on a plan are seven choices, not seven breakfasts', () => {
  // The real shape of the seeded plan, and the reason a client's screen once
  // read 18,485 cal: three meals, seven options each, all summed.
  const [breakfast] = daySections(
    [
      planItem({ meal: 'breakfast', name: 'Pancakes', calories: 935 }),
      planItem({ meal: 'breakfast', name: 'Steak burrito', calories: 950 }),
      planItem({ meal: 'breakfast', name: 'Yogurt bowl', calories: 900 }),
    ],
    []
  );
  assert.deepEqual(breakfast!.plannedCalories, { min: 900, max: 950 });
});

test('a day is one pick per meal, floor to ceiling', () => {
  const range = dayRange([
    { items: [{ calories: 900, protein: 65, carbs: 105, fat: 20 }, { calories: 950, protein: 60, carbs: 78, fat: 40 }] },
    { items: [{ calories: 910, protein: 70, carbs: 76, fat: 32 }, { calories: 970, protein: 68, carbs: 90, fat: 34 }] },
    { items: [{ calories: 760, protein: 65, carbs: 58, fat: 26 }, { calories: 780, protein: 60, carbs: 52, fat: 34 }] },
  ]);
  // Not 5,270 — that is the sum of all six, which nobody eats.
  assert.deepEqual(range.calories, { min: 2570, max: 2700 });
  assert.deepEqual(range.protein, { min: 188, max: 200 });
});

test('an empty meal contributes nothing to the day', () => {
  assert.deepEqual(rangeOf([]), { min: 0, max: 0 });
  assert.deepEqual(dayRange([{ items: [] }]).calories, { min: 0, max: 0 });
});

test('a range with one value prints as one number', () => {
  assert.equal(formatRange({ min: 2600, max: 2600 }), '2,600');
  assert.equal(formatRange({ min: 2430, max: 2700 }), '2,430–2,700');
});

test('the verdict asks whether the target is reachable, not what the plan sums to', () => {
  // 2,600 target sits inside 2,570–2,700, so some combination lands it.
  assert.deepEqual(rangeVerdict({ min: 2570, max: 2700 }, 2600, 100), { kind: 'covers' });
  // Every option is small: even the biggest day falls short.
  assert.deepEqual(rangeVerdict({ min: 1600, max: 1800 }, 2600, 100), { kind: 'under', by: 800 });
  // Every option is large: even the smallest day is over.
  assert.deepEqual(rangeVerdict({ min: 3200, max: 3600 }, 2600, 100), { kind: 'over', by: 600 });
});

test('the tolerance stops a near miss being reported as a problem', () => {
  // 80 calories short of target across the whole range — inside the noise of
  // anybody's portioning, so it must not light up red.
  assert.deepEqual(rangeVerdict({ min: 2480, max: 2520 }, 2600, 100), { kind: 'covers' });
  assert.deepEqual(rangeVerdict({ min: 2400, max: 2450 }, 2600, 100), { kind: 'under', by: 150 });
});

test('a planned line counts as eaten when it was logged under any other name casing', () => {
  const eaten = loggedNameSet([{ name: '  Chicken And Rice ' }, { name: '' }]);
  assert.equal(eaten.has('chicken and rice'), true);
  assert.equal(eaten.size, 1, 'a blank name should not become an entry that matches nothing');
});

test('the first meal you have not eaten is the one that opens', () => {
  const sections = daySections(
    [
      planItem({ meal: 'breakfast', name: 'Pancakes' }),
      planItem({ meal: 'lunch', name: 'Chicken bowl' }),
      planItem({ meal: 'dinner', name: 'Steak' }),
    ],
    [log({ meal: 'breakfast', name: 'Pancakes' })]
  );
  assert.equal(nextOpenSlot(sections), 'lunch');
});

test('with nothing eaten yet it opens on the first meal of the day', () => {
  const sections = daySections(
    [planItem({ meal: 'breakfast' }), planItem({ meal: 'dinner' })],
    []
  );
  assert.equal(nextOpenSlot(sections), 'breakfast');
});

test('a fully logged day opens nothing', () => {
  const sections = daySections(
    [planItem({ meal: 'lunch', name: 'Chicken bowl' })],
    [log({ meal: 'lunch', name: 'Chicken bowl' })]
  );
  assert.equal(nextOpenSlot(sections), null);
  assert.equal(nextOpenSlot([]), null);
});

test('totals add up across every meal at once', () => {
  const totals = eatenTotals([
    log({ calories: 300, protein: 24, carbs: 10, fat: 18 }),
    log({ calories: 500, protein: 45, carbs: 50, fat: 12 }),
  ]);
  assert.deepEqual(totals, { calories: 800, protein: 69, carbs: 60, fat: 30 });
});

/*
  A synced day is not a snack.

  Apple Health hands over MyFitnessPal's daily totals with no meal attached,
  and slotOf() sends anything mealless to Snack. Without the carve-out below
  the client's screen tells them they ate the entire day as one snack.
*/

test('a whole-day sync stays out of the meal sections', () => {
  const sections = daySections(
    [],
    [
      log({ meal: 'lunch', name: 'Chicken bowl', calories: 500 }),
      log({ meal: null, name: 'Apple Health', calories: 2140, source: 'apple_health' }),
    ]
  );
  const snack = sections.find((s) => s.slot === 'snack');
  assert.equal(snack, undefined);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].slot, 'lunch');
});

test('a synced row with a real meal on it does sit under that meal', () => {
  // An exporter that can split by meal should behave like anything else.
  const sections = daySections(
    [],
    [log({ meal: 'breakfast', name: 'Apple Health', calories: 600, source: 'apple_health' })]
  );
  assert.equal(sections.length, 1);
  assert.equal(sections[0].slot, 'breakfast');
  assert.equal(sections[0].calories, 600);
});

test('the whole-day sync is still found, and still counts toward the day', () => {
  const logs = [
    log({ meal: 'lunch', calories: 500, protein: 45, carbs: 50, fat: 12 }),
    log({
      meal: null,
      name: 'Apple Health',
      calories: 2140,
      protein: 186,
      carbs: 210,
      fat: 62,
      source: 'apple_health',
    }),
  ];
  assert.equal(wholeDaySync(logs)?.calories, 2140);
  // Totals are summed from every log, not from the sections.
  assert.equal(eatenTotals(logs).calories, 2640);
  assert.equal(wholeDaySync([log({ meal: 'lunch' })]), null);
});

test('a manual row with no meal is still a snack', () => {
  // The carve-out is for synced rows only — quick-adds keep their old home.
  const sections = daySections([], [log({ meal: null, name: 'Handful of almonds' })]);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].slot, 'snack');
});
