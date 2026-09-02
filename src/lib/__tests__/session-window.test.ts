/*
  The window that decides whether a set belongs to the session you are in.

  Both edges of this shipped wrong, and both failures were invisible until a
  client hit them. Too tight and a session that crossed midnight split into
  two logs, taking its own sets off the screen. Too loose — completeWorkout
  had no lower bound at all — and Finish reached back to an abandoned log
  from a previous week, writing a seven-day duration and ticking the wrong
  day on the coach's calendar.

  So the cases here are the boundary itself, from both sides.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { openSessionSince, OPEN_SESSION_MS } from '@/lib/session-window';

const NY = { profile: { timezone: 'America/New_York' } };
const LA = { profile: { timezone: 'America/Los_Angeles' } };

/** The instant a wall-clock time in a zone actually happened. */
function at(iso: string) {
  return new Date(iso);
}

test('mid-morning, the window is just local midnight', () => {
  // 9:30am EDT on 1 Sep 2026 -> 13:30 UTC.
  const now = at('2026-09-01T13:30:00Z');
  const since = openSessionSince(NY, now);

  // Local midnight EDT (UTC-4) is 04:00 UTC.
  assert.equal(since.toISOString(), '2026-09-01T04:00:00.000Z');
});

test('a log left open last night is out of reach the next morning', () => {
  const now = at('2026-09-01T13:30:00Z'); // 9:30am EDT
  const since = openSessionSince(NY, now);

  const abandonedLastNight = at('2026-08-31T23:00:00Z'); // 7pm EDT yesterday
  assert.ok(
    abandonedLastNight < since,
    'yesterday evening must not count as the session in progress'
  );
});

test('just after midnight, the window reaches back into the evening', () => {
  // 00:05 EDT on 2 Sep -> 04:05 UTC.
  const now = at('2026-09-02T04:05:00Z');
  const since = openSessionSince(NY, now);

  const startedAt2210 = at('2026-09-02T02:10:00Z'); // 10:10pm EDT, 1 Sep
  assert.ok(
    startedAt2210 >= since,
    'a session started before midnight is still the one in progress at 00:05'
  );
});

test('the reach back stops at OPEN_SESSION_MS, not at all of yesterday', () => {
  const now = at('2026-09-02T04:05:00Z'); // 00:05 EDT
  const since = openSessionSince(NY, now);

  assert.equal(since.getTime(), now.getTime() - OPEN_SESSION_MS);

  const yesterdayAfternoon = at('2026-09-01T18:00:00Z'); // 2pm EDT
  assert.ok(
    yesterdayAfternoon < since,
    'an abandoned afternoon log must not be swept into the small hours'
  );
});

test('once the grace window sits inside today, midnight wins again', () => {
  // 07:00 EDT is more than six hours after local midnight, so the grace
  // point (01:00 EDT) is already inside today and midnight is the earlier
  // of the two.
  const now = at('2026-09-01T11:00:00Z');
  const since = openSessionSince(NY, now);

  assert.equal(since.toISOString(), '2026-09-01T04:00:00.000Z');
  assert.ok(
    since.getTime() < now.getTime() - OPEN_SESSION_MS,
    'the window is the whole of today, which is wider than the grace period'
  );
});

test('exactly at local midnight the whole window is the grace period', () => {
  const now = at('2026-09-02T04:00:00Z'); // 00:00 EDT
  const since = openSessionSince(NY, now);

  assert.equal(since.getTime(), now.getTime() - OPEN_SESSION_MS);
});

test('the boundary is the client zone, not the server', () => {
  // 02:00 UTC on 2 Sep is 7pm PDT on 1 Sep — the middle of an evening
  // session, nowhere near a boundary for this client.
  const now = at('2026-09-02T02:00:00Z');
  const since = openSessionSince(LA, now);

  // Local midnight PDT (UTC-7) on 1 Sep is 07:00 UTC.
  assert.equal(since.toISOString(), '2026-09-01T07:00:00.000Z');

  const startedAt1840 = at('2026-09-02T01:40:00Z');
  assert.ok(startedAt1840 >= since);
});

test('a client with no timezone still gets a sane window', () => {
  const now = at('2026-09-01T13:30:00Z');
  const since = openSessionSince({ profile: null }, now);

  assert.ok(since <= now, 'the window never starts in the future');
  assert.ok(now.getTime() - since.getTime() <= 24 * 60 * 60 * 1000);
});
