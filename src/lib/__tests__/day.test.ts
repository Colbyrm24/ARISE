/*
  Days, in the timezone whose day it is.

  Every case here is one that was silently wrong before src/lib/day.ts
  existed, or one that would break if the two kinds of "day" in this codebase
  — the instant an event happened, and the @db.Date label for a calendar date
  — ever got confused for each other again.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayIn,
  todayIn,
  daysAgoIn,
  zoneOf,
  dayOfStored,
  startOfDayInstant,
  hourIn,
  DEFAULT_TZ,
} from '@/lib/day';

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

const K = dayKey;
const NY = 'America/New_York';
const LA = 'America/Los_Angeles';

// --- the bug this exists to fix
// LA client, dinner 7pm PDT Aug 25 = 02:00 UTC Aug 26
const dinner = new Date('2026-08-26T02:00:00Z');
test('LA dinner files on Aug 25, not Aug 26', ()=>assert.equal(K(dayIn(dinner,'America/Los_Angeles')),'2026-08-25'));
test('the old UTC behaviour really was Aug 26', ()=>assert.equal(dinner.toISOString().slice(0,10),'2026-08-26'));
test('same instant is Aug 25 in NY too', ()=>assert.equal(K(dayIn(dinner,'America/New_York')),'2026-08-25'));
// 11pm PDT step post
const steps = new Date('2026-08-26T06:00:00Z'); // 11pm PDT Aug 25
test('11pm PDT steps file on Aug 25', ()=>assert.equal(K(dayIn(steps,'America/Los_Angeles')),'2026-08-25'));
test('but 11pm PDT is already Aug 26 in NY', ()=>assert.equal(K(dayIn(steps,'America/New_York')),'2026-08-26'));

// --- boundaries
test('LA midnight exactly', ()=>assert.equal(K(dayIn(new Date('2026-08-25T07:00:00Z'),'America/Los_Angeles')),'2026-08-25'));
test('one ms before LA midnight is prior day', ()=>assert.equal(K(dayIn(new Date('2026-08-25T06:59:59.999Z'),'America/Los_Angeles')),'2026-08-24'));
test('NY midnight exactly (EDT)', ()=>assert.equal(K(dayIn(new Date('2026-08-25T04:00:00Z'),'America/New_York')),'2026-08-25'));
test('one ms before NY midnight', ()=>assert.equal(K(dayIn(new Date('2026-08-25T03:59:59.999Z'),'America/New_York')),'2026-08-24'));
test('EST (winter) midnight is 05:00Z', ()=>assert.equal(K(dayIn(new Date('2026-01-15T05:00:00Z'),'America/New_York')),'2026-01-15'));
test('EST one ms earlier', ()=>assert.equal(K(dayIn(new Date('2026-01-15T04:59:59.999Z'),'America/New_York')),'2026-01-14'));
test('east of UTC: Auckland is already tomorrow', ()=>assert.equal(K(dayIn(new Date('2026-08-25T13:00:00Z'),'Pacific/Auckland')),'2026-08-26'));
test('half-hour zone: Kolkata', ()=>assert.equal(K(dayIn(new Date('2026-08-25T18:31:00Z'),'Asia/Kolkata')),'2026-08-26'));

// --- DST — the day the clocks move
// US DST forward 2026-03-08 (2am->3am local). That local day is 23h long.
const dstFwd = new Date('2026-03-08T12:00:00Z');
test('daysAgoIn steps calendar dates across spring forward', ()=>{
  assert.equal(K(daysAgoIn(0,'America/New_York',dstFwd)),'2026-03-08');
  assert.equal(K(daysAgoIn(1,'America/New_York',dstFwd)),'2026-03-07');
  assert.equal(K(daysAgoIn(2,'America/New_York',dstFwd)),'2026-03-06');
});
// US DST back 2026-11-01, that local day is 25h long.
const dstBack = new Date('2026-11-01T12:00:00Z');
test('and across fall back — no repeated date', ()=>{
  const days=[0,1,2,3].map(i=>K(daysAgoIn(i,'America/New_York',dstBack)));
  assert.deepEqual(days,['2026-11-01','2026-10-31','2026-10-30','2026-10-29']);
  assert.equal(new Set(days).size,4);
});
test('7 days back never skips or repeats over a year', ()=>{
  for (let d=0; d<365; d+=1) {
    const at = new Date(Date.UTC(2026,0,1,17,0,0) + d*86400000);
    const seq = [0,1,2,3,4,5,6].map(i=>K(daysAgoIn(i,'America/New_York',at)));
    assert.equal(new Set(seq).size, 7, 'dupe at day '+d+': '+seq);
  }
});

// --- zoneOf
test('missing profile -> default', ()=>assert.equal(zoneOf(null),DEFAULT_TZ));
test('empty string -> default', ()=>assert.equal(zoneOf({timezone:'  '}),DEFAULT_TZ));
test('garbage -> default, does not throw', ()=>assert.equal(zoneOf({timezone:'Not/AZone'}),DEFAULT_TZ));
test('valid passes through', ()=>assert.equal(zoneOf({timezone:'America/Denver'}),'America/Denver'));
test('dayIn tolerates garbage tz', ()=>assert.equal(K(dayIn(new Date('2026-08-25T12:00:00Z'),'Not/AZone')),'2026-08-25'));
test('dayIn tolerates null tz', ()=>assert.equal(K(dayIn(new Date('2026-08-25T12:00:00Z'),null)),'2026-08-25'));

// --- dayOfStored is NOT tz-aware, on purpose
test('a @db.Date read round-trips unchanged', ()=>{
  const stored = new Date('2026-08-25T00:00:00Z');
  assert.equal(K(dayOfStored(stored)),'2026-08-25');
});
test('re-interpreting a stored date in LA would have shifted it', ()=>{
  const stored = new Date('2026-08-25T00:00:00Z');
  assert.equal(K(dayIn(stored,'America/Los_Angeles')),'2026-08-24'); // why the two are separate
  assert.equal(K(dayOfStored(stored)),'2026-08-25');
});

// --- results are always UTC midnight
test('todayIn', ()=>{const d=todayIn('America/Los_Angeles');assert.equal(d.getUTCHours(),0);assert.equal(d.getUTCMinutes(),0);assert.equal(d.getUTCSeconds(),0);assert.equal(d.getUTCMilliseconds(),0)});
test('daysAgoIn', ()=>{const d=daysAgoIn(30,'Asia/Kolkata');assert.equal(d.getUTCHours(),0);assert.equal(d.getUTCMilliseconds(),0)});
test('month rollover backwards', ()=>assert.equal(K(daysAgoIn(1,'America/New_York',new Date('2026-09-01T12:00:00Z'))),'2026-08-31'));
test('year rollover backwards', ()=>assert.equal(K(daysAgoIn(1,'America/New_York',new Date('2026-01-01T12:00:00Z'))),'2025-12-31'));


/*
  --- startOfDayInstant vs todayIn

  These two look interchangeable and are not, which is its own bug: `todayIn`
  is the @db.Date LABEL for a calendar date, `startOfDayInstant` is the MOMENT
  that date began. Bounding a DateTime column with the label is wrong by the
  zone offset, which is how last night's unfinished session got swept into
  this morning's.
*/
test('the two are different by exactly the zone offset', () => {
  const now = new Date('2026-08-25T18:00:00Z');
  const label = todayIn(NY, now);
  const moment = startOfDayInstant(NY, now);
  assert.equal(K(label), '2026-08-25');
  // EDT is UTC-4, so the day began at 04:00Z — four hours AFTER the label.
  assert.equal(moment.toISOString(), '2026-08-25T04:00:00.000Z');
  assert.equal(moment.getTime() - label.getTime(), 4 * 3600_000);
});

test('a 8:30pm session does not count as the next morning', () => {
  // The regression: startedAt 2026-08-25T00:30Z is 8:30pm ET on Aug 24.
  const startedAt = new Date('2026-08-25T00:30:00Z');
  const nextMorning = new Date('2026-08-25T11:00:00Z'); // 7am ET Aug 25
  assert.ok(
    startedAt >= todayIn(NY, nextMorning),
    'the label wrongly includes it — this is the bug'
  );
  assert.ok(
    startedAt < startOfDayInstant(NY, nextMorning),
    'the instant correctly excludes it'
  );
});

test('a session started after local midnight does count', () => {
  const startedAt = new Date('2026-08-25T13:00:00Z'); // 9am ET Aug 25
  const now = new Date('2026-08-25T18:00:00Z');
  assert.ok(startedAt >= startOfDayInstant(NY, now));
});

test('correct across both DST transitions', () => {
  // Spring forward 2026-03-08: EST(-5) becomes EDT(-4) at 2am local.
  assert.equal(
    startOfDayInstant(NY, new Date('2026-03-08T18:00:00Z')).toISOString(),
    '2026-03-08T05:00:00.000Z' // midnight was still EST
  );
  // Fall back 2026-11-01: EDT(-4) becomes EST(-5) at 2am local.
  assert.equal(
    startOfDayInstant(NY, new Date('2026-11-01T18:00:00Z')).toISOString(),
    '2026-11-01T04:00:00.000Z' // midnight was still EDT
  );
});

test('LA and a garbage zone both behave', () => {
  const now = new Date('2026-08-25T18:00:00Z');
  assert.equal(startOfDayInstant(LA, now).toISOString(), '2026-08-25T07:00:00.000Z');
  assert.equal(
    startOfDayInstant('Not/AZone', now).toISOString(),
    startOfDayInstant(DEFAULT_TZ, now).toISOString()
  );
});

// --- hourIn
test('the greeting reads the client clock, not the server', () => {
  // 03:00Z — the server would say 3am and greet with "Good morning".
  const at = new Date('2026-08-26T03:00:00Z');
  assert.equal(hourIn(LA, at), 20); // 8pm in LA
  assert.equal(hourIn(NY, at), 23);
});

test('midnight reads as 0, not 24', () => {
  assert.equal(hourIn(NY, new Date('2026-08-25T04:00:00Z')), 0);
});
