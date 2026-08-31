/*
  What day a health reading belongs to.

  The phone posting here sends one of three shapes, and only one of them is an
  actual instant. Getting that distinction wrong files a day's steps against
  the wrong date, and the `clientId_date` upsert then overwrites a real count
  with it — so these are the cases that decide whether the Today screen shows
  a number or a zero.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHealthPayload } from '@/lib/health-payload';

const LA = 'America/Los_Angeles';
const NY = 'America/New_York';
const key = (d: Date) => d.toISOString().slice(0, 10);
const dayOf = (body: unknown, tz?: string) => {
  const r = parseHealthPayload(body, tz);
  return r ? key(r.date) : null;
};

// --- wall time is taken literally, never re-zoned
test('a bare date is that date, in any zone', () => {
  assert.equal(dayOf({ date: '2026-08-25', steps: 9000 }, LA), '2026-08-25');
  assert.equal(dayOf({ date: '2026-08-25', steps: 9000 }, NY), '2026-08-25');
  assert.equal(dayOf({ date: '2026-08-25', steps: 9000 }, 'Pacific/Auckland'), '2026-08-25');
});

test('a zone-less datetime is wall time, so the date stands', () => {
  // The regression case. Shortcuts and Health Auto Export both emit this, JS
  // reads it as server-local, and re-zoning it moved anything before 04:00
  // back a day — over-writing the previous day's real step count.
  assert.equal(dayOf({ date: '2026-08-25T03:14:00', steps: 11240 }, NY), '2026-08-25');
  assert.equal(dayOf({ date: '2026-08-25T00:05:00', steps: 11240 }, NY), '2026-08-25');
  assert.equal(dayOf({ date: '2026-08-25T23:59:00', steps: 11240 }, LA), '2026-08-25');
});

test('a space separator counts as wall time too', () => {
  assert.equal(dayOf({ date: '2026-08-25 03:14:00', steps: 1 }, NY), '2026-08-25');
});

test('an unpadded date still lands on the right day', () => {
  // "2026-8-5" missed the old regex and fell through to Date parsing, which
  // put it on Aug 4.
  assert.equal(dayOf({ date: '2026-8-5', steps: 1 }, NY), '2026-08-05');
});

// --- an explicit offset IS an instant, and gets resolved
test('a Z timestamp resolves into the client zone', () => {
  // 02:00Z on Aug 26 is 7pm Aug 25 in LA.
  assert.equal(dayOf({ date: '2026-08-26T02:00:00Z', steps: 1 }, LA), '2026-08-25');
  assert.equal(dayOf({ date: '2026-08-26T02:00:00Z', steps: 1 }, NY), '2026-08-25');
});

test('an explicit numeric offset resolves too', () => {
  assert.equal(dayOf({ date: '2026-08-25T19:00:00-07:00', steps: 1 }, LA), '2026-08-25');
});

// --- no date at all
test('an undated post uses the client zone, not the server', () => {
  const r = parseHealthPayload({ steps: 5000 }, LA);
  assert.ok(r);
  // Can't pin the value without freezing the clock, but it must be a clean
  // UTC-midnight date rather than a timestamp.
  assert.equal(r.date.getUTCHours(), 0);
  assert.equal(r.date.getUTCMilliseconds(), 0);
});

// --- refusals
test('junk is refused rather than stored', () => {
  assert.equal(parseHealthPayload({ date: 'sometime tuesday', steps: 1 }, NY), null);
  assert.equal(parseHealthPayload(null, NY), null);
  assert.equal(parseHealthPayload('nope', NY), null);
});

test('an absurd year is refused', () => {
  // "2026-13-45" rolls over into next year rather than throwing.
  assert.equal(parseHealthPayload({ date: '1970-01-01', steps: 1 }, NY), null);
});

test('a reading with nothing usable in it is refused', () => {
  assert.equal(parseHealthPayload({ date: '2026-08-25' }, NY), null);
});

/*
  The eating half.

  This is the MyFitnessPal integration in practice: MFP writes meal totals to
  Apple Health, an exporter posts them here, and the field names it uses are
  not ones we chose. The cases below are the ones that decide whether a real
  export lands or is silently thrown away.
*/

const macros = (body: unknown) => parseHealthPayload(body, NY)?.nutrition ?? null;

test('a plain calorie total with macros lands', () => {
  assert.deepEqual(macros({ date: '2026-08-25', calories: 2140, protein: 186, carbs: 210, fat: 62 }), {
    calories: 2140,
    protein: 186,
    carbs: 210,
    fat: 62,
    meal: null,
  });
});

test("HealthKit's own field names land too", () => {
  // What Health Auto Export actually emits, and the reason this is alias-based
  // rather than one agreed spelling.
  assert.deepEqual(
    macros({
      date: '2026-08-25',
      dietaryEnergy: 1980,
      dietaryProtein: 171,
      dietaryCarbohydrates: 190,
      dietaryFatTotal: 55,
    }),
    { calories: 1980, protein: 171, carbs: 190, fat: 55, meal: null }
  );
  assert.deepEqual(
    macros({
      date: '2026-08-25',
      dietary_energy: 1980,
      dietary_protein: 171,
      dietary_carbohydrates: 190,
      dietary_fat_total: 55,
    }),
    { calories: 1980, protein: 171, carbs: 190, fat: 55, meal: null }
  );
});

test('numbers arriving as strings still parse', () => {
  // Shortcuts sends strings for everything unless you fight it.
  assert.equal(macros({ date: '2026-08-25', calories: '2140', protein: '186' })?.calories, 2140);
  assert.equal(macros({ date: '2026-08-25', calories: '2140', protein: '186' })?.protein, 186);
});

test('missing macros count as zero, not as a refusal', () => {
  // A calorie total with nothing else enabled is still a calorie total.
  assert.deepEqual(macros({ date: '2026-08-25', calories: 2140 }), {
    calories: 2140,
    protein: 0,
    carbs: 0,
    fat: 0,
    meal: null,
  });
});

test('macros without calories are refused rather than derived', () => {
  // Deriving 4/4/9 over whatever happened to be enabled would put a
  // 700-calorie day on the headline for somebody exporting protein alone.
  assert.equal(macros({ date: '2026-08-25', protein: 186, carbs: 210, fat: 62 }), null);
  assert.equal(parseHealthPayload({ date: '2026-08-25', protein: 186 }, NY), null);
});

test('a zero-calorie day is refused', () => {
  // The 4am export, which would otherwise overwrite yesterday's real total.
  assert.equal(macros({ date: '2026-08-25', calories: 0, protein: 0 }), null);
  assert.equal(macros({ date: '2026-08-25', calories: -50 }), null);
});

test('absurd numbers are refused or dropped, never stored', () => {
  assert.equal(macros({ date: '2026-08-25', calories: 99000 }), null);
  // One bad macro does not cost the whole row.
  assert.equal(macros({ date: '2026-08-25', calories: 2000, protein: 99999 })?.protein, 0);
  assert.equal(macros({ date: '2026-08-25', calories: 2000, protein: -12 })?.protein, 0);
  assert.equal(macros({ date: '2026-08-25', calories: 2000, carbs: 'lots' })?.carbs, 0);
});

test('a named meal is kept, an invented one is not', () => {
  assert.equal(macros({ date: '2026-08-25', calories: 600, meal: 'Breakfast' })?.meal, 'breakfast');
  assert.equal(macros({ date: '2026-08-25', calories: 600, meal: 'brunch' })?.meal, null);
  assert.equal(macros({ date: '2026-08-25', calories: 600 })?.meal, null);
});

test('nutrition rides alongside steps and weight in one post', () => {
  const r = parseHealthPayload(
    { date: '2026-08-25', steps: 12000, weight: 181.4, calories: 2140, protein: 186 },
    NY
  );
  assert.ok(r);
  assert.equal(r.steps, 12000);
  assert.equal(r.weight, 181.4);
  assert.equal(r.nutrition?.calories, 2140);
});

test('nutrition alone is enough to make a post usable', () => {
  // Before this, a body with no steps and no weight was rejected outright.
  const r = parseHealthPayload({ date: '2026-08-25', calories: 2140 }, NY);
  assert.ok(r);
  assert.equal(r.steps, undefined);
  assert.equal(r.nutrition?.calories, 2140);
});
