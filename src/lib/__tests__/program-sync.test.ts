import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { desiredRows, phaseDates, planSync, subscriptionProgress, type ExistingRow } from '../program-sync';
import { materialize, phaseRanges, type MaterialItem } from '../program-calendar';

/*
  The rules Colby chose for editing a program people are on: future days
  change, past and finished days never do, and a day he moved by hand stays
  where he put it — and is not written a second time where the master says.
*/

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const key = (x: Date) => x.toISOString().slice(0, 10);

function item(id: string, dayIndex: number, extra: Partial<MaterialItem> = {}): MaterialItem {
  return {
    id,
    dayIndex,
    kind: 'workout',
    workoutId: `w-${id}`,
    workout: { name: `Lift ${id}` },
    cardioTypeId: null,
    cardioMinutes: null,
    cardioTarget: null,
    stepTarget: null,
    label: null,
    note: null,
    ...extra,
  };
}

/** Rows exactly as a deploy from `start` would have written them. */
function deployed(items: MaterialItem[], start: Date, totalDays: number): ExistingRow[] {
  return materialize(items, start, totalDays).map((m, i) => ({
    ...m,
    id: `row-${i}`,
    completed: false,
    pinned: false,
  }));
}

const START = d('2026-11-02'); // Day 1
const TODAY = d('2026-11-09'); // Day 8

describe('planSync', () => {
  test('an unchanged master changes nothing', () => {
    const items = [item('a', 1), item('b', 8), item('c', 10)];
    const existing = deployed(items, START, 14);
    const plan = planSync({ startDate: START, today: TODAY, items, totalDays: 14, existing });
    assert.deepEqual(plan.deleteIds, []);
    assert.deepEqual(plan.create, []);
    assert.equal(plan.kept, 2); // Days 8 and 10; Day 1 is in the past
  });

  test('a moved item rewrites only future rows', () => {
    const before = [item('a', 1), item('b', 8), item('c', 10)];
    const existing = deployed(before, START, 14);
    const after = [item('a', 3), item('b', 8), item('c', 12)];
    const plan = planSync({ startDate: START, today: TODAY, items: after, totalDays: 14, existing });
    // Day 10's row goes; Day 12 is written. Day 1 (past) is not deleted and
    // the item moved to Day 3 (also past) is not written.
    const c10 = existing.find((r) => key(r.date) === '2026-11-11')!;
    assert.deepEqual(plan.deleteIds, [c10.id]);
    assert.deepEqual(
      plan.create.map((r) => [key(r.date), r.sourceKey]),
      [['2026-11-13', 'ci:c:0']]
    );
  });

  test("today counts as the future: today's unfinished row can change", () => {
    const existing = deployed([item('b', 8)], START, 14);
    const plan = planSync({ startDate: START, today: TODAY, items: [item('b', 8, { note: 'Go light' })], totalDays: 14, existing });
    assert.equal(plan.deleteIds.length, 1);
    assert.equal(plan.create[0].note, 'Go light');
  });

  test('completed rows are never deleted, and their item is not written again', () => {
    const items = [item('b', 8), item('c', 10)];
    const existing = deployed(items, START, 14).map((r) =>
      r.sourceKey === 'ci:b:0' ? { ...r, completed: true } : r
    );
    const plan = planSync({
      startDate: START,
      today: TODAY,
      items: [item('b', 9), item('c', 10)],
      totalDays: 14,
      existing,
    });
    assert.deepEqual(plan.deleteIds, []);
    assert.deepEqual(plan.create, []);
  });

  test('a pinned row stays put and its sourceKey is not regenerated', () => {
    const items = [item('b', 8), item('c', 10)];
    const existing = deployed(items, START, 14).map((r) =>
      // The coach dragged c from Day 10 to Day 13 on this client's calendar.
      r.sourceKey === 'ci:c:0' ? { ...r, date: d('2026-11-14'), pinned: true } : r
    );
    const plan = planSync({
      startDate: START,
      today: TODAY,
      items: [item('b', 8), item('c', 11, { note: 'changed' })],
      totalDays: 14,
      existing,
    });
    assert.ok(!plan.deleteIds.includes(existing.find((r) => r.pinned)!.id));
    assert.ok(!plan.create.some((r) => r.sourceKey === 'ci:c:0'));
  });

  test('a deleted item removes its future rows', () => {
    const existing = deployed([item('b', 8), item('c', 10)], START, 14);
    const plan = planSync({ startDate: START, today: TODAY, items: [item('b', 8)], totalDays: 14, existing });
    assert.equal(plan.deleteIds.length, 1);
    assert.equal(plan.create.length, 0);
  });

  test('a shortened program drops the cut days for a coaching client', () => {
    const existing = deployed([item('b', 8), item('z', 20)], START, 21);
    const plan = planSync({ startDate: START, today: TODAY, items: [item('b', 8), item('z', 20)], totalDays: 14, existing });
    assert.equal(plan.deleteIds.length, 1);
    assert.equal(plan.create.length, 0);
  });

  test('a repeating (member) calendar is covered through its last row, cycle by cycle', () => {
    const items = [item('a', 1), item('b', 8)];
    // Two runs of a 14-day program already on the calendar.
    const existing = [
      ...deployed(items, START, 14),
      ...materialize(items, d('2026-11-16'), 14, { cycle: 1 }).map((m, i) => ({
        ...m,
        id: `c1-${i}`,
        completed: false,
        pinned: false,
      })),
    ];
    const plan = planSync({ startDate: START, today: TODAY, items, totalDays: 14, existing, repeats: true });
    assert.deepEqual(plan.deleteIds, []);
    assert.deepEqual(plan.create, []);
    assert.equal(plan.kept, 3);

    const changed = planSync({
      startDate: START,
      today: TODAY,
      items: [item('a', 2), item('b', 8)],
      totalDays: 14,
      existing,
      repeats: true,
    });
    // Cycle 1's Day 1 row moves to its Day 2; cycle 0's Day 1 is in the past.
    assert.deepEqual(
      changed.create.map((r) => [key(r.date), r.sourceKey]),
      [['2026-11-17', 'ci:a:1']]
    );
  });

  test('`through` extends a calendar into the next cycle', () => {
    const items = [item('a', 1), item('b', 8)];
    const existing = deployed(items, START, 14);
    const plan = planSync({ startDate: START, today: TODAY, items, totalDays: 14, existing, through: d('2026-11-29') });
    assert.deepEqual(
      plan.create.map((r) => [key(r.date), r.sourceKey]),
      [
        ['2026-11-16', 'ci:a:1'],
        ['2026-11-23', 'ci:b:1'],
      ]
    );
  });

  test('a client deployed from the weekly pattern is left alone', () => {
    const existing: ExistingRow[] = [
      { ...deployed([item('b', 8)], START, 14)[0], sourceKey: null },
    ];
    const plan = planSync({ startDate: START, today: TODAY, items: [item('x', 9)], totalDays: 14, existing });
    assert.equal(plan.skipped, 'weekly-pattern');
    assert.deepEqual(plan.deleteIds, []);
    assert.deepEqual(plan.create, []);
  });

  test('a row the coach removed from this client is not written back by the next edit', () => {
    const items = [item('b', 8), item('c', 10)];
    // The coach deleted c's Day 10 row from this one client's calendar.
    const existing = deployed(items, START, 14).filter((r) => r.sourceKey !== 'ci:c:0');
    const plan = planSync({
      startDate: START,
      today: TODAY,
      items: [item('b', 8, { note: 'master edit' }), item('c', 10)],
      totalDays: 14,
      existing,
      skippedKeys: ['ci:c:0'],
    });
    assert.ok(!plan.create.some((r) => r.sourceKey === 'ci:c:0'));
    // The rest of the edit still lands.
    assert.deepEqual(plan.create.map((r) => r.sourceKey), ['ci:b:0']);

    // Without the skip it would have come straight back — the gap being fixed.
    const unskipped = planSync({ startDate: START, today: TODAY, items, totalDays: 14, existing });
    assert.ok(unskipped.create.some((r) => r.sourceKey === 'ci:c:0'));
  });

  test('a skipped key only skips that occurrence, not later cycles of the same item', () => {
    const items = [item('a', 1), item('b', 8)];
    const existing = deployed(items, START, 14);
    const plan = planSync({
      startDate: START,
      today: TODAY,
      items,
      totalDays: 14,
      existing,
      through: d('2026-11-29'),
      skippedKeys: ['ci:a:1'],
    });
    assert.deepEqual(plan.create.map((r) => r.sourceKey), ['ci:b:1']);
  });

  test('a replaced day stays off even after its pinned replacement is removed too', () => {
    const items = [item('b', 8), item('c', 10)];
    // c was replaced with a rest day (pinned, carrying c's key), then the coach
    // removed that rest day as well: no row carries the key any more, but it
    // is still skipped, so c does not reappear.
    const existing = deployed(items, START, 14).filter((r) => r.sourceKey !== 'ci:c:0');
    const plan = planSync({ startDate: START, today: TODAY, items, totalDays: 14, existing, skippedKeys: ['ci:c:0'] });
    assert.deepEqual(plan.create, []);
    assert.deepEqual(plan.deleteIds, []);
  });

  test('rows of this template from before the start date are not deleted', () => {
    // Re-added with Day 1 on Nov 16: the deploy kept the old run's rows
    // between today and then, and a sync must not take them on the next edit.
    const NEW_START = d('2026-11-16');
    const items = [item('a', 1), item('b', 3)];
    const oldRun = deployed(items, START, 14).map((r) => ({ ...r, date: d('2026-11-10'), id: `old-${r.id}` }));
    const newRun = deployed(items, NEW_START, 14);
    const plan = planSync({
      startDate: NEW_START,
      today: TODAY,
      items,
      totalDays: 14,
      existing: [...oldRun, ...newRun],
    });
    assert.deepEqual(plan.deleteIds, []);
    assert.deepEqual(plan.create, []);
    assert.equal(plan.kept, 2);
  });

  test('message items are skipped for clients who cannot receive them', () => {
    const items = [item('m', 9, { kind: 'message', workoutId: null, workout: null, note: 'Deload' })];
    const plan = planSync({ startDate: START, today: TODAY, items, totalDays: 14, existing: [], skipKinds: ['message'] });
    assert.equal(plan.create.length, 0);
  });
});

describe('desiredRows', () => {
  test('stops at `through` and never loops forever on a zero-length program', () => {
    assert.deepEqual(desiredRows([item('a', 1)], START, 0, d('2027-01-01')), []);
    const rows = desiredRows([item('a', 1)], START, 7, d('2026-11-15'));
    assert.deepEqual(rows.map((r) => key(r.date)), ['2026-11-02', '2026-11-09']);
  });
});

describe('subscriptionProgress', () => {
  const ranges = phaseRanges([
    { id: 'p1', weeks: 4 },
    { id: 'p2', weeks: 4 },
  ]);
  test('running, upcoming, finished, unknown', () => {
    assert.deepEqual(subscriptionProgress(START, d('2026-12-07'), ranges, 56), {
      state: 'running',
      dayIndex: 36,
      week: 6,
      phaseId: 'p2',
      phaseWeek: 2,
    });
    assert.deepEqual(subscriptionProgress(START, d('2026-10-30'), ranges, 56), { state: 'upcoming', startsInDays: 3 });
    assert.deepEqual(subscriptionProgress(START, d('2026-12-28'), ranges, 56), { state: 'finished' });
    assert.deepEqual(subscriptionProgress(null, TODAY, ranges, 56), { state: 'unknown' });
  });
});

describe('phaseDates', () => {
  test('real dates per phase and the current one', () => {
    const ranges = phaseRanges([
      { id: 'p1', weeks: 1 },
      { id: 'p2', weeks: 2 },
    ]);
    const out = phaseDates(ranges, START, TODAY);
    assert.deepEqual(
      out.map((p) => [p.id, key(p.from), key(p.to), p.current, p.past]),
      [
        ['p1', '2026-11-02', '2026-11-08', false, true],
        ['p2', '2026-11-09', '2026-11-22', true, false],
      ]
    );
  });
});
