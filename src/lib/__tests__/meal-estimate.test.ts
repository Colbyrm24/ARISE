/*
  Totals for a meal, and the one rule that separates the two kinds of read.

  A photograph of a plate is estimated, so its calories and its macros are two
  independent guesses that can disagree — the 4/4/9 check catches that. A
  screenshot of a tracking app is transcribed, so there is nothing to catch:
  the app printed both figures, and any gap is its rounding, or fibre, or
  sugar alcohols. Overwriting a printed 537 with a computed 522 would mean the
  coach's number never matches what the client is looking at on their own
  phone, which is the one outcome that makes the feature worse than useless.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, type EstimateItem } from '@/lib/meal-estimate';

const item = (o: Partial<EstimateItem> & { name: string }): EstimateItem => ({
  portion: '1 serving',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  ...o,
});

// --- a plate whose two halves agree
test('consistent plate is left alone', () => {
  // 50p + 60c + 20f = 200 + 240 + 180 = 620
  const r = reconcile([item({ name: 'chicken and rice', calories: 620, protein: 50, carbs: 60, fat: 20 })]);
  assert.equal(r.calories, 620);
  assert.equal(r.adjusted, false);
});

test('sums across items', () => {
  const r = reconcile([
    item({ name: 'chicken', calories: 280, protein: 52, carbs: 0, fat: 6 }),
    item({ name: 'rice', calories: 220, protein: 4, carbs: 45, fat: 1 }),
  ]);
  assert.equal(r.protein, 56);
  assert.equal(r.carbs, 45);
  assert.equal(r.fat, 7);
  assert.equal(r.calories, 500);
});

// --- a plate whose halves disagree: macros win
test('macros win when the stated calories are far off', () => {
  // Macros say 620; the model said 300.
  const r = reconcile([item({ name: 'steak', calories: 300, protein: 50, carbs: 60, fat: 20 })]);
  assert.equal(r.adjusted, true);
  assert.equal(r.calories, 620);
});

test('small rounding gaps are tolerated', () => {
  // Macros say 620, stated 660 — inside the 15% / flat-60 slack.
  const r = reconcile([item({ name: 'bowl', calories: 660, protein: 50, carbs: 60, fat: 20 })]);
  assert.equal(r.adjusted, false);
  assert.equal(r.calories, 660);
});

test('a small plate gets the flat 60 rather than a useless percentage', () => {
  // Macros say 100 (25c); 15% of that is 15, which nothing survives.
  const r = reconcile([item({ name: 'apple', calories: 150, protein: 0, carbs: 25, fat: 0 })]);
  assert.equal(r.adjusted, false);
});

// --- alcohol carries calories no macro accounts for
test('a beer is not reconciled away', () => {
  const r = reconcile([
    item({ name: 'chicken and rice', calories: 620, protein: 50, carbs: 60, fat: 20 }),
    item({ name: 'IPA', calories: 210, protein: 2, carbs: 18, fat: 0 }),
  ]);
  assert.equal(r.adjusted, false);
  assert.equal(r.calories, 830, 'the beer must be carried at its stated calories');
});

test('alcohol cannot drag the food half off', () => {
  // The food agrees with itself; only the drink has "missing" calories.
  const r = reconcile([
    item({ name: 'salmon', calories: 400, protein: 40, carbs: 0, fat: 24 }),
    item({ name: 'glass of wine', calories: 125, protein: 0, carbs: 4, fat: 0 }),
  ]);
  assert.equal(r.adjusted, false);
});

/*
  --- food that merely sounds like a drink

  The exemption switched the whole 4/4/9 check off for an item, and the test
  for it was the item's NAME. With no closing word boundary that matched
  prefixes — `gin` matched ginger, `ale` matched alevin, `hard ` matched hard
  boiled — and even with a boundary, scotch egg and sake salmon are food.

  Measured before the fix: "chicken stir fry" at 520 stated against 690 from
  its macros was corrected to 690; the identical plate called "ginger chicken
  stir fry" was carried at 520. Same food, 25% under, decided by one word.
*/
test('a word that looks like a drink does not exempt the food it is in', () => {
  const wrong = { calories: 520, protein: 45, carbs: 60, fat: 30 }; // 4/4/9 = 690

  for (const name of [
    'ginger chicken stir fry',
    'hard boiled eggs and toast',
    'scotch egg platter',
    'sake glazed salmon',
    'stout beef stew',
    'apple cider vinegar slaw',
    'rumaki',
  ]) {
    const r = reconcile([item({ name, ...wrong })]);
    assert.equal(r.adjusted, true, `${name} must stay inside the 4/4/9 check`);
    assert.equal(r.calories, 690, `${name} must be corrected to its macros`);
  }
});

test('a real drink is still carried at its stated calories', () => {
  // Ethanol is 7 kcal/g and sits in no macro column, so a drink's calories
  // tower over its own 4/4/9. That gap is what identifies it, not the name.
  for (const drink of [
    { name: 'pale ale', calories: 210, protein: 2, carbs: 18, fat: 0 },
    { name: 'glass of red wine', calories: 125, protein: 0, carbs: 4, fat: 0 },
    { name: 'vodka soda', calories: 97, protein: 0, carbs: 0, fat: 0 },
    { name: 'white claw', calories: 100, protein: 0, carbs: 2, fat: 0 },
  ]) {
    const r = reconcile([item(drink)]);
    assert.equal(r.adjusted, false, `${drink.name} must not be reconciled`);
    assert.equal(r.calories, drink.calories);
  }
});

// --- screens are transcribed, never rewritten
test('a screen is never reconciled, even when the numbers do not add up', () => {
  // 47p + 62c + 12g fat = 188 + 248 + 108 = 544, printed as 537. Fibre and
  // rounding. The printed figure is what the client is looking at.
  const logged = [item({ name: 'Breakfast', calories: 537, protein: 47, carbs: 62, fat: 12 })];

  const asPlate = reconcile(logged, 'plate');
  const asScreen = reconcile(logged, 'screen');

  assert.equal(asScreen.adjusted, false);
  assert.equal(asScreen.calories, 537, 'the printed number must survive');
  // And the same input read as a plate is within slack too — so this test
  // would pass for the wrong reason without a case the rule actually bites on.
  assert.equal(asPlate.calories, 537);
});

test('a screen keeps its figure even on a gap that would flip a plate', () => {
  // Sugar alcohols and fibre can push a real tracker entry well outside the
  // 4/4/9 arithmetic; a protein bar is the usual culprit.
  // 30p + 40c + 10f computes to 370 against a printed 200. The gap is 170,
  // well past the max(60, 15%) slack, so a plate would be rewritten.
  const bar = [item({ name: 'protein bar', calories: 200, protein: 30, carbs: 40, fat: 10 })];
  assert.equal(reconcile(bar, 'plate').adjusted, true);
  assert.equal(reconcile(bar, 'plate').calories, 370);

  assert.equal(reconcile(bar, 'screen').adjusted, false);
  assert.equal(reconcile(bar, 'screen').calories, 200);
});

test('screen totals still sum across entries', () => {
  const r = reconcile(
    [
      item({ name: 'Oats', calories: 190, protein: 7, carbs: 33, fat: 3 }),
      item({ name: 'Shake', calories: 170, protein: 25, carbs: 6, fat: 3 }),
    ],
    'screen'
  );
  assert.equal(r.calories, 360);
  assert.equal(r.protein, 32);
});

// --- defaults
test('the default source is plate, so old callers keep reconciling', () => {
  const bad = [item({ name: 'mystery', calories: 100, protein: 50, carbs: 50, fat: 20 })];
  assert.equal(reconcile(bad).adjusted, true);
});

test('an empty plate totals to zero rather than NaN', () => {
  const r = reconcile([]);
  assert.equal(r.calories, 0);
  assert.equal(r.protein, 0);
  assert.equal(r.adjusted, false);
});
