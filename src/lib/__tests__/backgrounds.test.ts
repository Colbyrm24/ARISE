import test from 'node:test';
import assert from 'node:assert/strict';

import { BACKGROUNDS, DEFAULT_BACKGROUND, backgroundOf } from '@/lib/backgrounds';

/*
  The stored value goes straight into a `data-bg` attribute, and the CSS only
  has rules for the names it knows. Anything else renders a page with no
  background rules at all — so the fallback is the whole point of this module.
*/

test('a known background is kept', () => {
  for (const bg of BACKGROUNDS) {
    assert.equal(backgroundOf(bg.id), bg.id);
  }
});

test('never chosen falls back to the default', () => {
  assert.equal(backgroundOf(null), DEFAULT_BACKGROUND);
  assert.equal(backgroundOf(undefined), DEFAULT_BACKGROUND);
  assert.equal(backgroundOf(''), DEFAULT_BACKGROUND);
});

test('a renamed or junk theme falls back rather than rendering unstyled', () => {
  assert.equal(backgroundOf('midnight'), DEFAULT_BACKGROUND);
  assert.equal(backgroundOf('BEAM'), DEFAULT_BACKGROUND);
  assert.equal(backgroundOf('beam ember'), DEFAULT_BACKGROUND);
});

test('every background has a distinct id and a swatch to draw', () => {
  const ids = new Set(BACKGROUNDS.map((b) => b.id));
  assert.equal(ids.size, BACKGROUNDS.length);
  for (const bg of BACKGROUNDS) {
    assert.ok(bg.name.length > 0);
    assert.match(bg.swatch.ground, /^hsl\(/);
    assert.match(bg.swatch.accent, /^hsl\(/);
  }
});

test('the default is one of the offered backgrounds', () => {
  assert.ok(BACKGROUNDS.some((b) => b.id === DEFAULT_BACKGROUND));
});
