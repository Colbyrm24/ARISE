import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isDayKey, pickPrimary, planMove, planShift, shiftKey, type PlanItem } from '../schedule-move';

const chest: PlanItem = { id: 'chest', date: '2026-10-19', kind: 'workout', completed: false };
const restWed: PlanItem = { id: 'rest-wed', date: '2026-10-21', kind: 'rest', completed: false };

describe('planMove', () => {
  test('dropping on an empty day is a plain move', () => {
    const r = planMove(chest, '2026-10-22', []);
    assert.deepEqual(r, { ok: true, moves: [{ id: 'chest', date: '2026-10-22' }] });
  });

  test('dropping on a rest day swaps the two days', () => {
    // The bug this prevents: stacking the lift on top of the rest row, so the
    // client opens the app Wednesday and is told to rest.
    const r = planMove(chest, '2026-10-21', [restWed]);
    assert.deepEqual(r, {
      ok: true,
      moves: [
        { id: 'chest', date: '2026-10-21' },
        { id: 'rest-wed', date: '2026-10-19' },
      ],
    });
  });

  test('a finished session on the target day stays where it was done', () => {
    const done: PlanItem = { id: 'legs', date: '2026-10-21', kind: 'workout', completed: true };
    const r = planMove(chest, '2026-10-21', [done]);
    assert.deepEqual(r, { ok: true, moves: [{ id: 'chest', date: '2026-10-21' }] });
  });

  test('a finished session cannot be moved at all', () => {
    const r = planMove({ ...chest, completed: true }, '2026-10-22', []);
    assert.equal(r.ok, false);
  });

  test('dropping back on its own day changes nothing', () => {
    assert.deepEqual(planMove(chest, chest.date, [chest]), { ok: true, moves: [] });
  });

  test('refuses dates that are not real days', () => {
    assert.equal(planMove(chest, '2026-02-30', []).ok, false);
    assert.equal(planMove(chest, 'tomorrow', []).ok, false);
  });

  test('never moves the dragged row twice if a stale read returns it on the target', () => {
    const r = planMove(chest, '2026-10-21', [{ ...chest, date: '2026-10-21' }, restWed]);
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.moves.filter((m) => m.id === 'chest').length, 1);
  });
});

describe('planShift', () => {
  const week: PlanItem[] = [
    { id: 'mon', date: '2026-10-19', kind: 'workout', completed: true },
    { id: 'tue', date: '2026-10-20', kind: 'workout', completed: false },
    { id: 'wed', date: '2026-10-21', kind: 'rest', completed: false },
    { id: 'thu', date: '2026-10-22', kind: 'workout', completed: false },
  ];

  test('pushes everything unfinished from the day onward, keeping its order', () => {
    const r = planShift(week, '2026-10-20', 1);
    assert.deepEqual(r, {
      ok: true,
      moves: [
        { id: 'tue', date: '2026-10-21' },
        { id: 'wed', date: '2026-10-22' },
        { id: 'thu', date: '2026-10-23' },
      ],
    });
  });

  test('leaves finished sessions and earlier days alone', () => {
    const r = planShift(week, '2026-10-19', 2);
    assert.ok(r.ok);
    if (r.ok) assert.ok(!r.moves.some((m) => m.id === 'mon'));
  });

  test('only forward, and within a month', () => {
    assert.equal(planShift(week, '2026-10-20', 0).ok, false);
    assert.equal(planShift(week, '2026-10-20', -1).ok, false);
    assert.equal(planShift(week, '2026-10-20', 31).ok, false);
    assert.equal(planShift(week, '2026-10-20', 1.5).ok, false);
  });

  test('crosses a month and a DST change as calendar days', () => {
    // US clocks go back on 2026-11-01. Calendar keys must not skip or repeat.
    assert.equal(shiftKey('2026-10-31', 1), '2026-11-01');
    assert.equal(shiftKey('2026-11-01', 1), '2026-11-02');
    assert.equal(shiftKey('2026-12-31', 1), '2027-01-01');
  });
});

describe('pickPrimary', () => {
  test('a lift beats rest, even when rest came back first', () => {
    const p = pickPrimary([
      { kind: 'rest', completedAt: null },
      { kind: 'workout', completedAt: null },
    ]);
    assert.equal(p?.kind, 'workout');
  });

  test('within a kind, the one still to do leads', () => {
    const p = pickPrimary([
      { kind: 'workout', completedAt: new Date(), id: 'done' },
      { kind: 'workout', completedAt: null, id: 'todo' },
    ]);
    assert.equal(p?.id, 'todo');
  });

  test('empty day is null', () => {
    assert.equal(pickPrimary([]), null);
  });
});

describe('isDayKey', () => {
  test('accepts real dates only', () => {
    assert.ok(isDayKey('2028-02-29'));
    assert.ok(!isDayKey('2027-02-29'));
    assert.ok(!isDayKey('2026-1-5'));
    assert.ok(!isDayKey(undefined));
  });
});
