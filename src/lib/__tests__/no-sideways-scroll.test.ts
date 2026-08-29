import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
  The app scrolls up and down. It does not scroll sideways.

  This is a CSS bug that cannot be caught by a type checker and is invisible
  on a desktop, where a 16px scrollbar and 1700px of window hide it. On a
  phone it is the entire app sliding under your thumb and springing back.

  It shipped once already: the grain overlay was `position: fixed` with
  `inset: -50%`, so it hung half a viewport off both sides and made the
  scrollable area twice as wide as the screen. These tests are here so the
  next person who reaches for a negative inset on a fixed layer finds out
  before a client does.
*/

// Comments stripped first: this file is heavily commented, and a comment
// sitting between two rules otherwise gets swallowed into the next selector.
const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
);

/** Rule bodies, paired with the selector that introduced them. */
function blocks(source: string) {
  const found: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    found.push({ selector: m[1]!.trim().replace(/\s+/g, ' '), body: m[2]! });
  }
  return found;
}

test('the page cannot be dragged sideways', () => {
  const guard = blocks(css).find(
    (b) => /(^|,\s*)html\b/.test(b.selector) && /overflow-x:\s*clip/.test(b.body)
  );
  assert.ok(
    guard,
    'globals.css must pin html/body to `overflow-x: clip` so nothing can scroll the page horizontally'
  );
});

test('the sideways guard uses clip, never hidden', () => {
  // `overflow: hidden` on html/body makes them scroll containers, which
  // silently breaks every position:sticky descendant in the app. If someone
  // "fixes" this by swapping clip for hidden, sticky headers die quietly.
  for (const b of blocks(css)) {
    if (!/(^|,\s*)(html|body)\b/.test(b.selector)) continue;
    assert.ok(
      !/overflow(-x)?:\s*hidden/.test(b.body),
      `${b.selector} uses overflow:hidden — use clip, or sticky positioning breaks app-wide`
    );
  }
});

test('no fixed overlay hangs off the edge of the screen', () => {
  for (const b of blocks(css)) {
    if (!/position:\s*fixed/.test(b.body)) continue;
    const inset = /(?:^|[;{\s])inset:\s*([^;]+);/.exec(b.body);
    if (!inset) continue;
    assert.ok(
      !inset[1]!.includes('-'),
      `${b.selector} is position:fixed with a negative inset (${inset[1]!.trim()}). ` +
        'A fixed layer wider than the viewport adds scrollable width — this is exactly ' +
        'the bug that made the whole app rock sideways on a phone.'
    );
  }
});

test('long unbroken text wraps rather than widening the page', () => {
  const body = blocks(css).find(
    (b) => /(^|,\s*)body\s*$/.test(b.selector) && /overflow-wrap/.test(b.body)
  );
  assert.ok(
    body,
    'body needs overflow-wrap so one long URL or food name cannot push the layout wider than the screen'
  );
});
