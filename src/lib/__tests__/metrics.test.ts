/*
  How full each ring and bar is.

  The division here has bitten this app before: `eaten / 0` is Infinity, and
  `Math.min(Infinity, 100)` is a cheerful 100, so a client with no protein
  target saw a FULL protein ring on a day they'd eaten 40g. "No goal set" and
  "goal complete" have to be different states, not the same one by accident.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { progressOf, fmt, METRICS, METRIC_META } from '@/lib/metrics';

// --- the divide-by-zero this exists to prevent
test('a zero target is untargeted, never 100%', () => {
  const p = progressOf(40, 0);
  assert.equal(p.untargeted, true);
  assert.equal(p.pct, 0);
  assert.equal(p.hit, false);
  assert.ok(Number.isFinite(p.ratio));
});

test('null and undefined targets behave the same as zero', () => {
  assert.equal(progressOf(40, null).untargeted, true);
  assert.equal(progressOf(40, undefined).untargeted, true);
  assert.equal(progressOf(40, NaN).untargeted, true);
});

test('a negative target is not a goal', () => {
  assert.equal(progressOf(40, -100).untargeted, true);
});

// --- ordinary progress
test('half way is 50%', () => {
  const p = progressOf(75, 150);
  assert.equal(p.pct, 50);
  assert.equal(p.hit, false);
  assert.equal(p.over, false);
});

test('exactly on target is hit but not over', () => {
  const p = progressOf(150, 150);
  assert.equal(p.pct, 100);
  assert.equal(p.hit, true);
  assert.equal(p.over, false);
});

test('past the target fills to 100 but reports the true ratio', () => {
  const p = progressOf(210, 150);
  assert.equal(p.pct, 100, 'the fill must not overflow its track');
  assert.equal(p.over, true);
  assert.equal(Number(p.ratio.toFixed(2)), 1.4);
});

test('nothing logged is empty, not untargeted', () => {
  const p = progressOf(0, 2100);
  assert.equal(p.untargeted, false);
  assert.equal(p.pct, 0);
});

test('a nonsense value floors at zero rather than going backwards', () => {
  assert.equal(progressOf(-50, 100).pct, 0);
  assert.equal(progressOf(NaN, 100).pct, 0);
});

// --- the palette contract
test('every metric has a hue and a mode', () => {
  for (const m of METRICS) {
    const meta = METRIC_META[m];
    assert.match(meta.color, /^#[0-9a-f]{6}$/, `${m} needs a hex hue`);
    assert.ok(meta.mode === 'budget' || meta.mode === 'reach', `${m} needs a mode`);
    assert.ok(meta.label.length > 0);
  }
});

test('no two metrics share a hue', () => {
  const hues = METRICS.map((m) => METRIC_META[m].color);
  assert.equal(new Set(hues).size, hues.length, 'a repeated hue makes two metrics indistinguishable');
});

test('protein and carbs are not adjacent in render order', () => {
  // #e66767 vs #c98500 is the one pair that fails the normal-vision floor
  // (13.0 ΔE, under 15). Fat sits between them on purpose.
  const order = [...METRICS];
  assert.notEqual(
    Math.abs(order.indexOf('protein') - order.indexOf('carbs')),
    1,
    'red beside yellow is the pair that fails validation — keep fat between them'
  );
});

test('calories and fat are ceilings; the rest are floors', () => {
  assert.equal(METRIC_META.calories.mode, 'budget');
  assert.equal(METRIC_META.fat.mode, 'budget');
  assert.equal(METRIC_META.protein.mode, 'reach');
  assert.equal(METRIC_META.steps.mode, 'reach');
});

// --- formatting
test('thousands get a separator', () => {
  assert.equal(fmt(1807), '1,807');
  assert.equal(fmt(12400), '12,400');
  assert.equal(fmt(75), '75');
  assert.equal(fmt(0), '0');
});
