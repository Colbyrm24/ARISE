import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXERCISE_VIDEOS } from '../exercise-videos';

test('every id is a well-formed YouTube id', () => {
  for (const [name, id] of Object.entries(EXERCISE_VIDEOS)) {
    assert.match(id, /^[A-Za-z0-9_-]{11}$/, name);
  }
});

test('covers the seeded library', () => {
  const sql = readFileSync('prisma/exercises-seed.sql', 'utf8');
  const names = [...sql.matchAll(/gen_random_uuid\(\), '((?:[^']|'')+)'/g)].map((m) => m[1].replace(/''/g, "'"));
  const missing = names.filter((n) => !EXERCISE_VIDEOS[n]);
  // Outdoor Walk has no demo on purpose.
  assert.deepEqual(missing, ['Outdoor Walk']);
});
