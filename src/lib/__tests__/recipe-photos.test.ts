import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECIPE_PHOTO_IDS, recipePhotoUrl } from '../recipe-photos';

test('every photo is a distinct Unsplash photo id', () => {
  const ids = Object.values(RECIPE_PHOTO_IDS);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^photo-[0-9]+-[0-9a-f]+$/);
});

test('urls point at the Unsplash image CDN with a width', () => {
  assert.equal(
    recipePhotoUrl('Steak & Eggs', 400),
    `https://images.unsplash.com/${RECIPE_PHOTO_IDS['Steak & Eggs']}?auto=format&fit=crop&w=400&q=80`
  );
  assert.equal(recipePhotoUrl('A recipe nobody wrote'), null);
});

test('the 21-meal seed library is fully covered', () => {
  const seed = readFileSync('src/lib/recipe-seed.ts', 'utf8');
  const titles = [...seed.matchAll(/title: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(titles.length >= 20);
  for (const t of titles) assert.ok(RECIPE_PHOTO_IDS[t], t);
});
