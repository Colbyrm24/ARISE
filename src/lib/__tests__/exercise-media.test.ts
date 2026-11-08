import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXERCISE_MEDIA, EXERCISE_MEDIA_BASE, exerciseImageUrls, exerciseStepsText } from '../exercise-media';

test('every mapped exercise has a start and a finish photo', () => {
  for (const [name, m] of Object.entries(EXERCISE_MEDIA)) assert.equal(m.images.length, 2, name);
  // Two library entries ship photos but no steps; they get photos only.
  assert.ok(Object.values(EXERCISE_MEDIA).filter((m) => m.steps.length > 0).length >= 250);
});

test('image URLs are pinned to one commit on the CDN', () => {
  assert.match(EXERCISE_MEDIA_BASE, /^https:\/\/cdn\.jsdelivr\.net\/gh\/yuhonas\/free-exercise-db@[0-9a-f]{40}\/exercises\/$/);
  const urls = exerciseImageUrls('Pec Deck');
  assert.equal(urls.length, 2);
  assert.ok(urls.every((u) => u.startsWith(EXERCISE_MEDIA_BASE) && u.endsWith('.jpg')));
});

test('unknown names get nothing rather than a wrong photo', () => {
  assert.deepEqual(exerciseImageUrls('Some Movement Nobody Has'), []);
  assert.equal(exerciseStepsText('Some Movement Nobody Has'), null);
});

test('steps are numbered one per line', () => {
  const t = exerciseStepsText('Pec Deck')!;
  assert.match(t, /^1\. /);
  assert.ok(t.split('\n').every((l, i) => l.startsWith(`${i + 1}. `)));
});

test('every mapped name is a real exercise in the seed or the program seed', () => {
  const seed = readFileSync('prisma/exercises-seed.sql', 'utf8') + readFileSync('src/lib/program-seed.ts', 'utf8');
  for (const name of Object.keys(EXERCISE_MEDIA)) {
    assert.ok(seed.includes(`'${name.replace(/'/g, "''")}'`) || seed.includes(`'${name}'`), name);
  }
});
