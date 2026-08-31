/*
  What earns a badge, and what order they are shown in.

  The ordering is the part with a real failure mode: a locked list in
  catalogue order buries the badge somebody is two days away from underneath
  four they cannot reach for months, and the near one is the only one that
  changes what they do today.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACHIEVEMENTS,
  achievementsFor,
  earnedCount,
  longestRun,
  type AchievementStats,
} from '@/lib/achievements';

const stats = (over: Partial<AchievementStats> = {}): AchievementStats => ({
  workouts: 0,
  bestStreak: 0,
  prs: 0,
  liftsWithPr: 0,
  poundsDown: 0,
  photos: 0,
  proteinStreak: 0,
  stepsLast30: 0,
  ...over,
});

const byId = (s: AchievementStats, id: string) =>
  achievementsFor(s).find((a) => a.id === id)!;

test('a brand new client holds nothing', () => {
  assert.equal(earnedCount(achievementsFor(stats())), 0);
});

test('the first workout is the first badge', () => {
  assert.equal(byId(stats({ workouts: 1 }), 'first-workout').earned, true);
});

test('streaks unlock at their own thresholds', () => {
  const s = stats({ bestStreak: 14 });
  assert.equal(byId(s, 'streak-7').earned, true);
  assert.equal(byId(s, 'streak-14').earned, true);
  assert.equal(byId(s, 'streak-30').earned, false);
});

test('weight badges need the pounds to actually be down', () => {
  assert.equal(byId(stats({ poundsDown: 12 }), 'down-10').earned, true);
  assert.equal(byId(stats({ poundsDown: 12 }), 'down-20').earned, false);
  // Someone who has gained does not get a badge, and does not get a negative bar.
  const gained = byId(stats({ poundsDown: -6 }), 'down-10');
  assert.equal(gained.earned, false);
  assert.equal(gained.progress, 0);
});

test('progress is a fraction, never past 1', () => {
  assert.equal(byId(stats({ stepsLast30: 50000 }), 'steps-100k').progress, 0.5);
  const nearly = byId(stats({ bestStreak: 6 }), 'streak-7').progress!;
  assert.ok(nearly > 0.8 && nearly < 1);
});

test('an earned badge carries no progress bar', () => {
  // It is finished. A full bar under a badge you already hold is noise.
  assert.equal(byId(stats({ stepsLast30: 200000 }), 'steps-100k').progress, null);
});

test('a badge that is a moment has no bar even when locked', () => {
  // You either did the first workout or you did not; there is no 40% of it.
  assert.equal(byId(stats(), 'first-workout').progress, null);
  assert.equal(byId(stats(), 'first-pr').progress, null);
});

test('earned badges come first', () => {
  const list = achievementsFor(stats({ workouts: 3, photos: 1 }));
  assert.deepEqual(list.slice(0, 2).map((a) => a.earned), [true, true]);
  assert.equal(list[2].earned, false);
});

test('among locked badges the nearest one is on top', () => {
  // Two days off a seven-day streak beats 5% of 100,000 steps.
  const list = achievementsFor(stats({ bestStreak: 5, stepsLast30: 5000 }));
  const locked = list.filter((a) => !a.earned);
  assert.equal(locked[0].id, 'streak-7');
});

test('the catalogue has no duplicate ids', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every badge in the catalogue reaches its earned state', () => {
  // A badge nobody can ever earn is worse than no badge at all.
  const maxed = stats({
    workouts: 500,
    bestStreak: 400,
    prs: 200,
    liftsWithPr: 40,
    poundsDown: 90,
    photos: 60,
    proteinStreak: 90,
    stepsLast30: 900000,
  });
  assert.equal(earnedCount(achievementsFor(maxed)), ACHIEVEMENTS.length);
});

/*
  The longest run, which is what a badge is allowed to be built on. The
  current streak is the wrong number here — miss a Tuesday and a badge you
  already earned would disappear.
*/

test('the longest run is found, not the most recent one', () => {
  const days = new Set([
    // a five-day run in July
    '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05',
    // then a two-day one in August
    '2026-08-20', '2026-08-21',
  ]);
  assert.equal(longestRun(days), 5);
});

test('a run survives across a month boundary', () => {
  assert.equal(longestRun(new Set(['2026-07-30', '2026-07-31', '2026-08-01'])), 3);
});

test('a gap breaks the run', () => {
  assert.equal(longestRun(new Set(['2026-08-01', '2026-08-03', '2026-08-04'])), 2);
});

test('one day is a run of one, and none is zero', () => {
  assert.equal(longestRun(new Set(['2026-08-01'])), 1);
  assert.equal(longestRun(new Set()), 0);
});

test('unsorted input does not confuse it', () => {
  assert.equal(longestRun(new Set(['2026-08-03', '2026-08-01', '2026-08-02'])), 3);
});
