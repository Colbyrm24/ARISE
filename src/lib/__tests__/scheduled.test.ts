import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sessionDay } from '../scheduled-day';

/*
  Which calendar day a finished session gets attributed to.

  The first version of these tests asserted that todayIn and dayOfStored work,
  which day.test.ts already covered. They were named after this bug and did
  not touch it: the code was deriving the day from the moment the client hit
  Finish rather than from when the session started, and every test passed.

  These exercise sessionDay, which is the actual decision.
*/

const LA = 'America/Los_Angeles';
const NY = 'America/New_York';
const SYD = 'Australia/Sydney';

describe('sessionDay', () => {
  test('a session belongs to the day it started, not the day it ended', () => {
    // Starts 11:50pm Thursday in LA, finishes 12:10am Friday.
    const started = new Date('2026-08-28T06:50:00Z'); // Thu 23:50 LA
    const finished = new Date('2026-08-28T07:10:00Z'); // Fri 00:10 LA

    assert.equal(sessionDay(started, LA).toISOString().slice(0, 10), '2026-08-27');
    // Attributing to the finish would have picked the next day, left
    // Thursday's chip hollow, and pre-ticked Friday before they trained it.
    assert.notEqual(
      sessionDay(started, LA).getTime(),
      sessionDay(finished, LA).getTime()
    );
  });

  test('the pre-tick then lost-tick sequence cannot happen', () => {
    // Thursday's late session, then Friday's real session.
    const thursdayLate = new Date('2026-08-28T06:50:00Z'); // Thu 23:50 LA
    const fridayEvening = new Date('2026-08-29T02:00:00Z'); // Fri 19:00 LA

    const a = sessionDay(thursdayLate, LA).toISOString().slice(0, 10);
    const b = sessionDay(fridayEvening, LA).toISOString().slice(0, 10);

    assert.equal(a, '2026-08-27');
    assert.equal(b, '2026-08-28');
    // Two sessions, two distinct days. Under the old behaviour both resolved
    // to Friday, the second found it already ticked, and one was lost.
    assert.notEqual(a, b);
  });

  test('an evening session west of Greenwich stays on its own local day', () => {
    const at = new Date('2026-08-28T03:00:00Z'); // 8pm Aug 27 in LA
    assert.equal(sessionDay(at, LA).toISOString().slice(0, 10), '2026-08-27');
  });

  test('the same instant is already the next day east of Greenwich', () => {
    const at = new Date('2026-08-28T03:00:00Z');
    assert.equal(sessionDay(at, SYD).toISOString().slice(0, 10), '2026-08-28');
  });

  test('a morning session lands on the day it happened', () => {
    const at = new Date('2026-08-27T14:00:00Z'); // 7am LA, 10am NY
    assert.equal(sessionDay(at, LA).toISOString().slice(0, 10), '2026-08-27');
    assert.equal(sessionDay(at, NY).toISOString().slice(0, 10), '2026-08-27');
  });

  test('one minute either side of local midnight', () => {
    assert.equal(
      sessionDay(new Date('2026-08-28T03:59:00Z'), NY).toISOString().slice(0, 10),
      '2026-08-27'
    );
    assert.equal(
      sessionDay(new Date('2026-08-28T04:01:00Z'), NY).toISOString().slice(0, 10),
      '2026-08-28'
    );
  });

  test('sessions either side of a DST change keep their own days', () => {
    // The US falls back on 2026-11-01, so the UTC offset differs between these.
    const before = new Date('2026-11-01T02:30:00Z'); // Oct 31, 10:30pm EDT
    const after = new Date('2026-11-02T03:30:00Z'); // Nov 1, 10:30pm EST
    assert.equal(sessionDay(before, NY).toISOString().slice(0, 10), '2026-10-31');
    assert.equal(sessionDay(after, NY).toISOString().slice(0, 10), '2026-11-01');
  });

  test('the result is a UTC-midnight day label, which is what @db.Date stores', () => {
    // ScheduledItem.date is @db.Date. A value carrying a time would never
    // match on equality.
    const d = sessionDay(new Date('2026-08-28T03:00:00Z'), LA);
    assert.equal(d.getUTCHours(), 0);
    assert.equal(d.getUTCMinutes(), 0);
    assert.equal(d.getUTCSeconds(), 0);
    assert.equal(d.getUTCMilliseconds(), 0);
  });

  test('an unknown timezone falls back rather than throwing', () => {
    const at = new Date('2026-08-27T14:00:00Z');
    assert.doesNotThrow(() => sessionDay(at, 'Not/AZone'));
    assert.doesNotThrow(() => sessionDay(at, null));
  });
});
