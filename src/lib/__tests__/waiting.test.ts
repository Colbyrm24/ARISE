/*
  Who is owed a reply.

  The join under test is fed by Prisma groupBy calls, which the offline type
  stub types as `any[]` — so a typecheck proves nothing about these shapes and
  this is the only thing that does. The last case is the regression that
  motivated the whole change: a thread that has been READ but not ANSWERED is
  still waiting.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleThreads, waitLevel, waitLabel, sortThreads } from '@/lib/waiting-shape';
import type { WaitingThread } from '@/lib/waiting-shape';


const COACH = 'coach-1';
const t = (iso: string) => new Date(iso);
const NOW = t('2026-08-25T18:00:00Z');


// --- waitLevel
test('no wait is fresh', () => assert.equal(waitLevel(null, NOW), 'fresh'));
test('2h fresh', () => assert.equal(waitLevel(t('2026-08-25T16:00:00Z'), NOW), 'fresh'));
test('5h today', () => assert.equal(waitLevel(t('2026-08-25T13:00:00Z'), NOW), 'today'));
test('20h stale', () => assert.equal(waitLevel(t('2026-08-24T22:00:00Z'), NOW), 'stale'));
test('3d cold', () => assert.equal(waitLevel(t('2026-08-22T18:00:00Z'), NOW), 'cold'));
test('boundary 3h is today, not fresh', () =>
  assert.equal(waitLevel(t('2026-08-25T15:00:00Z'), NOW), 'today'));
test('boundary 48h is cold, not stale', () =>
  assert.equal(waitLevel(t('2026-08-23T18:00:00Z'), NOW), 'cold'));
test('future date does not go negative', () =>
  assert.equal(waitLevel(t('2026-08-25T19:00:00Z'), NOW), 'fresh'));

// --- waitLabel
test('minutes', () => assert.equal(waitLabel(t('2026-08-25T17:25:00Z'), NOW), '35m'));
test('hours', () => assert.equal(waitLabel(t('2026-08-25T11:00:00Z'), NOW), '7h'));
test('days', () => assert.equal(waitLabel(t('2026-08-22T18:00:00Z'), NOW), '3d'));
test('empty when nothing', () => assert.equal(waitLabel(null, NOW), ''));
test('clock skew clamps to 0m', () =>
  assert.equal(waitLabel(t('2026-08-25T18:30:00Z'), NOW), '0m'));

/*
  Five clients covering every state the inbox has to render:
    ann   — she spoke last, twice, and has been waiting since 08:00
    ben   — he replied last, nothing owed
    cara  — never been replied to at all
    dan   — waiting, but only twenty minutes
    eve   — no messages in the thread whatsoever
*/
const people = [
  { clientId: 'ann', name: 'Ann Meyers' },
  { clientId: 'ben', name: 'Ben Ortiz' },
  { clientId: 'cara', name: 'Cara Liu' },
  { clientId: 'dan', name: 'Dan Reyes' },
  { clientId: 'eve', name: 'Eve' },
];

const edges = [
  { senderId: COACH, recipientId: 'ann', _max: { createdAt: t('2026-08-25T07:00:00Z') } },
  { senderId: 'ann', recipientId: COACH, _max: { createdAt: t('2026-08-25T12:30:00Z') } },
  { senderId: 'ben', recipientId: COACH, _max: { createdAt: t('2026-08-25T09:00:00Z') } },
  { senderId: COACH, recipientId: 'ben', _max: { createdAt: t('2026-08-25T09:05:00Z') } },
  { senderId: 'cara', recipientId: COACH, _max: { createdAt: t('2026-08-23T10:00:00Z') } },
  { senderId: COACH, recipientId: 'dan', _max: { createdAt: t('2026-08-25T17:00:00Z') } },
  { senderId: 'dan', recipientId: COACH, _max: { createdAt: t('2026-08-25T17:40:00Z') } },
];

const runs = [
  { senderId: 'ann', _min: { createdAt: t('2026-08-25T08:00:00Z') }, _count: { _all: 2 } },
  { senderId: 'cara', _min: { createdAt: t('2026-08-23T10:00:00Z') }, _count: { _all: 1 } },
  { senderId: 'dan', _min: { createdAt: t('2026-08-25T17:40:00Z') }, _count: { _all: 1 } },
];

const previews = [
  { senderId: 'ann', recipientId: COACH, body: 'did you see the photo?', createdAt: t('2026-08-25T12:30:00Z') },
  { senderId: COACH, recipientId: 'ann', body: 'morning', createdAt: t('2026-08-25T07:00:00Z') },
  { senderId: COACH, recipientId: 'ben', body: 'nice work', createdAt: t('2026-08-25T09:05:00Z') },
  { senderId: 'ben', recipientId: COACH, body: 'hit 185', createdAt: t('2026-08-25T09:00:00Z') },
  { senderId: 'cara', recipientId: COACH, body: 'hey, just signed up', createdAt: t('2026-08-23T10:00:00Z') },
  { senderId: 'dan', recipientId: COACH, body: 'lunch pic', createdAt: t('2026-08-25T17:40:00Z') },
  { senderId: COACH, recipientId: 'dan', body: 'go get it', createdAt: t('2026-08-25T17:00:00Z') },
];

const out = assembleThreads({
  coachId: COACH,
  people,
  edges,
  runs,
  previews,
  unreadBy: new Map([['ann', 2], ['dan', 1]]),
});
const by: Record<string, (typeof out)[number]> = Object.fromEntries(out.map((r) => [r.clientId, r]));

// --- assembleThreads
test('they spoke last -> waiting', () => assert.equal(by.ann.waiting, true));
test('he spoke last -> not waiting', () => assert.equal(by.ben.waiting, false));
test('never replied at all -> waiting', () => assert.equal(by.cara.waiting, true));
test('no messages at all -> not waiting', () => assert.equal(by.eve.waiting, false));

test('waitingSince is the run start, not the newest message', () =>
  assert.equal(by.ann.waitingSince?.toISOString(), '2026-08-25T08:00:00.000Z'));
test('unanswered counts the run', () => assert.equal(by.ann.unanswered, 2));
test('answered thread carries no run', () => {
  assert.equal(by.ben.waitingSince, null);
  assert.equal(by.ben.unanswered, 0);
});
test('unread is independent of waiting', () => {
  assert.equal(by.ann.unread, 2);
  assert.equal(by.ben.unread, 0);
});

test('preview is the newest message either way', () => {
  assert.equal(by.ann.lastBody, 'did you see the photo?');
  assert.equal(by.ben.lastBody, 'nice work');
});
test('empty thread has no preview', () => {
  assert.equal(by.eve.lastBody, null);
  assert.equal(by.eve.lastAt, null);
});
test('initials', () => {
  assert.equal(by.ann.initials, 'AM');
  assert.equal(by.eve.initials, 'E');
});

// --- ordering
test('waiting before answered', () => {
  const w = out.findIndex((r) => !r.waiting);
  assert.ok(out.slice(0, w).every((r) => r.waiting));
  assert.ok(out.slice(w).every((r) => !r.waiting));
});
test('longest wait first', () =>
  assert.deepEqual(out.filter((r) => r.waiting).map((r) => r.clientId), ['cara', 'ann', 'dan']));
test('answered sort by recency', () =>
  assert.deepEqual(out.filter((r) => !r.waiting).map((r) => r.clientId), ['ben', 'eve']));

// --- regression: the bug this replaces
test('a read-but-unanswered thread still counts as waiting', () => {
  // Opening the thread zeroes unread. Under the old inbox that dropped the
  // row out of "needs a reply" entirely; it must not here.
  const r = assembleThreads({
    coachId: COACH,
    people: [{ clientId: 'ann', name: 'Ann Meyers' }],
    edges: edges.filter((e) => e.senderId === 'ann' || e.recipientId === 'ann'),
    runs: runs.filter((r) => r.senderId === 'ann'),
    previews,
    unreadBy: new Map(),
  })[0];
  assert.equal(r.unread, 0);
  assert.equal(r.waiting, true);
  assert.equal(r.unanswered, 2);
});

// --- sortThreads is not destructive
test('input array untouched', () => {
  const base = { name: 'N', initials: 'N', avatarUrl: null, lastBody: null, unanswered: 0, unread: 0 };
  const a: WaitingThread[] = [
    { ...base, clientId: 'x', waiting: false, waitingSince: null, lastAt: t('2026-01-01T00:00:00Z') },
    { ...base, clientId: 'y', waiting: true, waitingSince: t('2026-01-01T00:00:00Z'), lastAt: null },
  ];
  const before = a.map((r) => r.clientId).join(',');
  sortThreads(a);
  assert.equal(a.map((r) => r.clientId).join(','), before);
});

