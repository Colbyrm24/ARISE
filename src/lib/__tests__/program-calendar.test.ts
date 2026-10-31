import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  phaseRanges,
  defaultPhaseName,
  implicitPhase,
  programWeeks,
  weekOf,
  weekdayOf,
  dayIndexFor,
  phaseForDay,
  expandRepeat,
  copyWeek,
  stampPattern,
  patternFromWeek,
  resizePhase,
  dateForDay,
  sourceKeyFor,
  parseSourceKey,
  materialize,
  itemLabel,
  orderDayItems,
  isRestDay,
  restingClients,
  cleanItemInput,
  type CalendarItemLike,
} from '../program-calendar';

/*
  What is pinned down here: Day N maps to the date a client actually sees,
  phases sit end to end without gaps or overlaps, a repeat never lands before
  the day the coach picked, resizing a phase keeps the next phase starting
  right after it, and a rest day stops being one the moment training is on it.
*/

const blank = {
  workoutId: null,
  cardioTypeId: null,
  cardioMinutes: null,
  cardioTarget: null,
  stepTarget: null,
  label: null,
  note: null,
};
const item = (id: string, dayIndex: number, kind = 'workout', extra: Partial<CalendarItemLike> = {}): CalendarItemLike => ({
  ...blank,
  workoutId: kind === 'workout' ? 'w1' : null,
  id,
  dayIndex,
  kind,
  ...extra,
});

describe('days and weeks', () => {
  test('Day 1 is week 1 position 1; Day 8 starts week 2', () => {
    assert.equal(weekOf(1), 1);
    assert.equal(weekOf(7), 1);
    assert.equal(weekOf(8), 2);
    assert.equal(weekdayOf(8), 1);
    assert.equal(weekdayOf(14), 7);
    assert.equal(dayIndexFor(3, 2), 16);
  });

  test('Day N is start + N - 1, across a month end and a DST change', () => {
    const start = new Date('2026-10-26T00:00:00Z'); // a Monday
    assert.equal(dateForDay(start, 1).toISOString().slice(0, 10), '2026-10-26');
    assert.equal(dateForDay(start, 7).toISOString().slice(0, 10), '2026-11-01');
    assert.equal(dateForDay(start, 8).toISOString().slice(0, 10), '2026-11-02');
    assert.equal(dateForDay(start, 68).toISOString().slice(0, 10), '2027-01-01');
  });
});

describe('phases', () => {
  test('lie end to end', () => {
    const r = phaseRanges([
      { id: 'a', weeks: 4 },
      { id: 'b', weeks: 8 },
    ]);
    assert.deepEqual(r[0], { id: 'a', startDay: 1, endDay: 28, startWeek: 1, endWeek: 4 });
    assert.deepEqual(r[1], { id: 'b', startDay: 29, endDay: 84, startWeek: 5, endWeek: 12 });
    assert.equal(phaseForDay(r, 29)?.id, 'b');
    assert.equal(phaseForDay(r, 85), null);
  });

  test('default names read like Trainerize', () => {
    assert.equal(defaultPhaseName(1, 4), 'Week 1 - 4');
    assert.equal(defaultPhaseName(5, 1), 'Week 5');
  });

  test('an implicit phase covers everything already on the calendar', () => {
    assert.equal(implicitPhase([]).weeks, 4);
    assert.equal(implicitPhase([{ dayIndex: 40 }]).weeks, 6);
  });

  test('the calendar never hides an item past the last phase', () => {
    assert.equal(programWeeks([{ id: 'a', weeks: 4 }], [{ dayIndex: 36 }]), 6);
    assert.equal(programWeeks([{ id: 'a', weeks: 4 }], []), 4);
  });
});

describe('expandRepeat', () => {
  test('no weekdays ticked is just the day picked', () => {
    assert.deepEqual(expandRepeat({ dayIndex: 3, weekdays: [] }), [3]);
  });

  test('Mon/Wed/Fri for 2 weeks from Day 1', () => {
    assert.deepEqual(expandRepeat({ dayIndex: 1, weekdays: [1, 3, 5], weeks: 2 }), [1, 3, 5, 8, 10, 12]);
  });

  test('never places anything before the day picked', () => {
    // Day 3 is position 3; position 1 in that week is already behind it.
    assert.deepEqual(expandRepeat({ dayIndex: 3, weekdays: [1, 3], weeks: 2 }), [3, 8, 10]);
  });

  test('to the end of the phase', () => {
    const days = expandRepeat({ dayIndex: 29, weekdays: [2], untilDay: 56 });
    assert.deepEqual(days, [30, 37, 44, 51]);
  });

  test('ignores nonsense weekdays and duplicates', () => {
    assert.deepEqual(expandRepeat({ dayIndex: 1, weekdays: [0, 8, 2, 2], weeks: 1 }), [2]);
  });
});

describe('copyWeek', () => {
  test('re-dates week 1 onto weeks 2 and 4, keeping positions in the week', () => {
    const items = [item('a', 1), item('b', 3, 'rest'), item('c', 9)];
    const out = copyWeek(items, 1, [2, 4, 1]);
    assert.deepEqual(
      out.map((o) => [o.dayIndex, o.kind]),
      [
        [8, 'workout'],
        [10, 'rest'],
        [22, 'workout'],
        [24, 'rest'],
      ]
    );
  });
});

describe('stampPattern', () => {
  test('slot 1 lands on the phase start of every week', () => {
    const pattern = [[{ ...blank, kind: 'workout', workoutId: 'w1' }], [], [{ ...blank, kind: 'rest' }], [], [], [], []];
    const out = stampPattern(pattern, { startDay: 29, endDay: 42 });
    assert.deepEqual(
      out.map((o) => [o.dayIndex, o.kind]),
      [
        [29, 'workout'],
        [31, 'rest'],
        [36, 'workout'],
        [38, 'rest'],
      ]
    );
  });

  test('the old Monday-first week becomes slots 1..7, dropping a workout day with no session', () => {
    const p = patternFromWeek([
      { weekday: 1, kind: 'workout', workoutId: 'w1', label: null, cardioTypeId: null, cardioMinutes: null, stepTarget: 10000 },
      { weekday: 2, kind: 'workout', workoutId: null, label: null, cardioTypeId: null, cardioMinutes: null, stepTarget: null },
      { weekday: 7, kind: 'rest', workoutId: 'stale', label: 'REST DAY', cardioTypeId: null, cardioMinutes: null, stepTarget: null },
    ]);
    assert.equal(p[0][0].workoutId, 'w1');
    assert.equal(p[0][0].stepTarget, 10000);
    assert.equal(p[1].length, 0);
    assert.equal(p[6][0].workoutId, null);
  });
});

describe('resizePhase', () => {
  const range = { startDay: 1, endDay: 28 };
  const items = [item('in', 5), item('tail', 26), item('next', 30), item('far', 60)];

  test('growing slides everything after the phase later', () => {
    const r = resizePhase(items, range, 6);
    assert.deepEqual(r.removeIds, []);
    assert.deepEqual(r.shifts, [
      { id: 'next', dayIndex: 44 },
      { id: 'far', dayIndex: 74 },
    ]);
  });

  test('shrinking drops the cut weeks and pulls the rest back', () => {
    const r = resizePhase(items, range, 3);
    assert.deepEqual(r.removeIds, ['tail']);
    assert.deepEqual(r.shifts, [
      { id: 'next', dayIndex: 23 },
      { id: 'far', dayIndex: 53 },
    ]);
  });

  test('zero weeks is deleting the phase', () => {
    const r = resizePhase(items, range, 0);
    assert.deepEqual(r.removeIds, ['in', 'tail']);
    assert.deepEqual(r.shifts[0], { id: 'next', dayIndex: 2 });
  });
});

describe('materialize', () => {
  const start = new Date('2026-11-02T00:00:00Z');

  test('several rows on one day, each with its own source key', () => {
    const rows = materialize(
      [
        item('lift', 1, 'workout', { workout: { name: 'Upper A' } } as Partial<CalendarItemLike>),
        item('swim', 1, 'cardio', {
          cardioTypeId: 'ct',
          cardioMinutes: 30,
          cardioTarget: '1 km easy',
          cardioType: { name: 'Swimming' },
        } as Partial<CalendarItemLike>),
        item('pics', 7, 'photos'),
      ],
      start,
      28
    );
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => [r.date.toISOString().slice(0, 10), r.label, r.sourceKey]),
      [
        ['2026-11-02', 'Upper A', 'ci:lift:0'],
        ['2026-11-02', 'Swimming · 30 min', 'ci:swim:0'],
        ['2026-11-08', 'Progress photos', 'ci:pics:0'],
      ]
    );
    assert.equal(rows[1].cardioTarget, '1 km easy');
  });

  test('leaves off days past the end, broken workouts, and skipped kinds', () => {
    const rows = materialize(
      [
        item('late', 40),
        item('gone', 2, 'workout', { workoutId: null }),
        item('msg', 3, 'message', { note: 'Week 1 done' }),
        item('ok', 4, 'rest'),
      ],
      start,
      28,
      { skipKinds: ['message'] }
    );
    assert.deepEqual(rows.map((r) => r.sourceKey), ['ci:ok:0']);
  });

  test('source keys round-trip', () => {
    assert.deepEqual(parseSourceKey(sourceKeyFor('abc-1', 2)), { itemId: 'abc-1', cycle: 2 });
    assert.equal(parseSourceKey('weird'), null);
    assert.equal(parseSourceKey(null), null);
  });

  test('labels', () => {
    assert.equal(itemLabel(item('r', 1, 'rest')), 'Rest day');
    assert.equal(itemLabel(item('c', 1, 'checkin')), 'Check-in');
    assert.equal(itemLabel(item('b', 1, 'bodystats', { label: 'Weigh-in + waist' })), 'Weigh-in + waist');
  });
});

describe('a day with several things on it', () => {
  test('reads lift first and rest last', () => {
    const out = orderDayItems([{ kind: 'rest' }, { kind: 'photos' }, { kind: 'workout' }, { kind: 'cardio' }]);
    assert.deepEqual(out.map((o) => o.kind), ['workout', 'cardio', 'photos', 'rest']);
  });

  test('a rest day is rest with no training on it', () => {
    assert.ok(isRestDay(['rest']));
    assert.ok(isRestDay(['rest', 'photos', 'checkin']));
    assert.ok(!isRestDay(['rest', 'workout']));
    assert.ok(!isRestDay(['rest', 'cardio']));
    assert.ok(!isRestDay(['photos']));
  });

  test('only clients whose day is really rest get the rest-day message', () => {
    const r = restingClients([
      { clientId: 'a', kind: 'rest' },
      { clientId: 'b', kind: 'rest' },
      { clientId: 'b', kind: 'workout' },
      { clientId: 'c', kind: 'rest' },
      { clientId: 'c', kind: 'photos' },
    ]);
    assert.deepEqual([...r].sort(), ['a', 'c']);
  });
});

describe('cleanItemInput', () => {
  test('drops fields that do not belong to the kind', () => {
    const r = cleanItemInput({ kind: 'rest', workoutId: 'w1', cardioMinutes: 30, stepTarget: '12000' });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.fields.workoutId, null);
      assert.equal(r.fields.cardioMinutes, null);
      assert.equal(r.fields.stepTarget, 12000);
    }
  });

  test('a workout needs a workout, a message needs words', () => {
    assert.equal(cleanItemInput({ kind: 'workout' }).ok, false);
    assert.equal(cleanItemInput({ kind: 'message', note: '   ' }).ok, false);
    assert.equal(cleanItemInput({ kind: 'party' }).ok, false);
  });

  test('cardio keeps the written target and clamps minutes', () => {
    const r = cleanItemInput({ kind: 'cardio', cardioTypeId: 'ct', cardioMinutes: '900', cardioTarget: ' 6 x 100 m ' });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.fields.cardioMinutes, 600);
      assert.equal(r.fields.cardioTarget, '6 x 100 m');
    }
  });
});
