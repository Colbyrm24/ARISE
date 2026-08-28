import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  // Deliberately a name no theme will ever have. 'midnight' used to sit here
  // and then became a real background, which is exactly how a guard like this
  // quietly stops guarding anything.
  assert.equal(backgroundOf('sunrise-v2'), DEFAULT_BACKGROUND);
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

test('every background offered has styles behind it', () => {
  /*
    A background in the picker with no [data-bg] block renders the default
    tokens, so the client taps a swatch and nothing happens. Reading the
    stylesheet is the only way to catch that — the list and the CSS are two
    files that have to agree.

    Beam is the default and is defined on :root rather than on a data
    attribute, so it is the one that must NOT have a block.
  */
  const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
  for (const bg of BACKGROUNDS) {
    if (bg.id === DEFAULT_BACKGROUND) continue;
    assert.ok(
      css.includes(`[data-bg='${bg.id}']`),
      `${bg.id} is offered in the picker but has no styles in globals.css`
    );
  }
});
