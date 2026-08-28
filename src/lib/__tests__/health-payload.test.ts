/*
  What day a health reading belongs to.

  The phone posting here sends one of three shapes, and only one of them is an
  actual instant. Getting that distinction wrong files a day's steps against
  the wrong date, and the `clientId_date` upsert then overwrites a real count
  with it — so these are the cases that decide whether the Today screen shows
  a number or a zero.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHealthPayload } from '@/lib/health-payload';

const LA = 'America/Los_Angeles';
const NY = 'America/New_York';
const key = (d: Date) => d.toISOString().slice(0, 10);
const dayOf = (body: unknown, tz?: string) => {
  const r = parseHealthPayload(body, tz);
  return r ? key(r.date) : null;
};

// --- wall time is taken literally, never re-zoned
test('a bare date is that date, in any zone', () => {
  assert.equal(dayOf({ date: '2026-08-25', steps: 9000 }, LA), '2026-08-25');
  assert.equal(dayOf({ date: '2026-08-25', steps: 9000 }, NY), '2026-08-25');
  assert.equal(dayOf({ date: '2026-08-25', steps: 9000 }, 'Pacific/Auckland'), '2026-08-25');
});

test('a zone-less datetime is wall time, so the date stands', () => {
  // The regression case. Shortcuts and Health Auto Export both emit this, JS
  // reads it as server-local, and re-zoning it moved anything before 04:00
  // back a day — over-writing the previous day's real step count.
  assert.equal(dayOf({ date: '2026-08-25T03:14:00', steps: 11240 }, NY), '2026-08-25');
  assert.equal(dayOf({ date: '2026-08-25T00:05:00', steps: 11240 }, NY), '2026-08-25');
  assert.equal(dayOf({ date: '2026-08-25T23:59:00', steps: 11240 }, LA), '2026-08-25');
});

test('a space separator counts as wall time too', () => {
  assert.equal(dayOf({ date: '2026-08-25 03:14:00', steps: 1 }, NY), '2026-08-25');
});

test('an unpadded date still lands on the right day', () => {
  // "2026-8-5" missed the old regex and fell through to Date parsing, which
  // put it on Aug 4.
  assert.equal(dayOf({ date: '2026-8-5', steps: 1 }, NY), '2026-08-05');
});

// --- an explicit offset IS an instant, and gets resolved
test('a Z timestamp resolves into the client zone', () => {
  // 02:00Z on Aug 26 is 7pm Aug 25 in LA.
  assert.equal(dayOf({ date: '2026-08-26T02:00:00Z', steps: 1 }, LA), '2026-08-25');
  assert.equal(dayOf({ date: '2026-08-26T02:00:00Z', steps: 1 }, NY), '2026-08-25');
});

test('an explicit numeric offset resolves too', () => {
  assert.equal(dayOf({ date: '2026-08-25T19:00:00-07:00', steps: 1 }, LA), '2026-08-25');
});

// --- no date at all
test('an undated post uses the client zone, not the server', () => {
  const r = parseHealthPayload({ steps: 5000 }, LA);
  assert.ok(r);
  // Can't pin the value without freezing the clock, but it must be a clean
  // UTC-midnight date rather than a timestamp.
  assert.equal(r.date.getUTCHours(), 0);
  assert.equal(r.date.getUTCMilliseconds(), 0);
});

// --- refusals
test('junk is refused rather than stored', () => {
  assert.equal(parseHealthPayload({ date: 'sometime tuesday', steps: 1 }, NY), null);
  assert.equal(parseHealthPayload(null, NY), null);
  assert.equal(parseHealthPayload('nope', NY), null);
});

test('an absurd year is refused', () => {
  // "2026-13-45" rolls over into next year rather than throwing.
  assert.equal(parseHealthPayload({ date: '1970-01-01', steps: 1 }, NY), null);
});

test('a reading with nothing usable in it is refused', () => {
  assert.equal(parseHealthPayload({ date: '2026-08-25' }, NY), null);
});
