/*
  Which DAYS the booking screen offers, across a DST transition.

  zonedTimeToUtc has always handled the transition itself correctly. The bug
  was one level up, in how the window enumerated the days to ask about: it
  stepped 86,400,000ms at a time, which drifts the local wall clock by an hour
  across a transition, and from a late-evening start that drift rolls the date
  over and a whole calendar day is never generated.

  So these tests assert on the SET OF DATES offered, not on individual slot
  times — the days are what went missing, and a client looking at an empty
  Sunday has no way to tell it from a coach with no Sunday hours.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { bookableSlots, type Availability } from '@/lib/schedule';

const TZ = 'America/New_York';

/** Open 10:00–11:00 every day, in two half-hour slots. */
const EVERY_DAY: Availability[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startMinute: 600,
  endMinute: 660,
  slotMinutes: 30,
}));

function datesOffered(fromIso: string, days: number) {
  const slots = bookableSlots({
    availability: EVERY_DAY,
    timeZone: TZ,
    from: new Date(fromIso),
    days,
    bookedStarts: new Set(),
    // The lead time is not what is under test here.
    leadMinutes: 0,
  });
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return [...new Set(slots.map((s) => fmt.format(s.startsAt)))].sort();
}

test('an ordinary week offers every day in the window', () => {
  // Mon 2 June 2025, 09:00 ET.
  const dates = datesOffered('2025-06-02T13:00:00Z', 3);
  assert.deepEqual(dates, ['2025-06-02', '2025-06-03', '2025-06-04', '2025-06-05']);
});

test('spring forward does not swallow the Sunday', () => {
  /*
    The regression. Sat 8 March 2025 at 23:30 ET, the night the clocks go
    forward. Stepping in milliseconds produced March 8, 10, 11 — Sunday the
    9th was never asked about, so a client opening /book that evening saw no
    Sunday times at all whatever the coach had set.

    March 8's own 10am is already past at 23:30, so it is correctly absent;
    the 9th is the one that has to be here.
  */
  const dates = datesOffered('2025-03-09T04:30:00Z', 3);
  assert.ok(dates.includes('2025-03-09'), 'Sunday 9 March must be offered');
  assert.deepEqual(dates, ['2025-03-09', '2025-03-10', '2025-03-11']);
});

test('fall back does not lose the last day of the window', () => {
  /*
    The mirror case, from Sat 1 November 2025 at 00:30 ET. Stepping in
    milliseconds repeated 2 November and reached only the 14th, quietly
    dropping a day off the far end of a fifteen-day window.
  */
  const dates = datesOffered('2025-11-01T04:30:00Z', 14);
  assert.equal(dates.length, 15, 'fifteen distinct days for days: 14');
  assert.equal(dates[0], '2025-11-01');
  assert.equal(dates[14], '2025-11-15');
  assert.equal(new Set(dates).size, dates.length, 'no day appears twice');
});

test('the offered days are contiguous across a transition', () => {
  const dates = datesOffered('2025-03-07T15:00:00Z', 5);
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(`${dates[i - 1]}T12:00:00Z`);
    const curr = new Date(`${dates[i]}T12:00:00Z`);
    assert.equal(
      (curr.getTime() - prev.getTime()) / 86400000,
      1,
      `${dates[i - 1]} and ${dates[i]} should be consecutive days`
    );
  }
});
