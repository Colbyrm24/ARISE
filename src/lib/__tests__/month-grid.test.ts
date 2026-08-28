import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addUtcDays,
  dayKey,
  inMonth,
  mondayIndex,
  monthGrid,
  monthKey,
  parseMonth,
  shiftMonth,
} from '../month-grid';

test('the grid always has six rows, whatever shape the month is', () => {
  // August 2026 starts on a Saturday — the worst case, and the one that
  // makes a five-row grid overflow.
  for (const [y, m] of [
    [2026, 7],
    [2026, 1],
    [2027, 4],
    [2024, 1], // leap February
  ] as const) {
    const grid = monthGrid(y, m);
    assert.equal(grid.days.length, 42, `${y}-${m + 1} should draw 42 squares`);
    assert.equal(dayKey(grid.days[41]!), dayKey(grid.gridEnd));
  }
});

test('the grid starts on the Monday of the week the 1st falls in', () => {
  const grid = monthGrid(2026, 7); // August 2026, the 1st is a Saturday
  assert.equal(grid.gridStart.getUTCDay(), 1, 'grid starts on a Monday');
  // Saturday is five days after that Monday, and the 1st must be inside.
  assert.equal(dayKey(addUtcDays(grid.gridStart, 5)), '2026-08-01');
});

test('Sunday belongs to the week that started six days earlier, not the next one', () => {
  // The off-by-one that puts a Sunday session on the following week's row.
  assert.equal(mondayIndex(new Date(Date.UTC(2026, 7, 2))), 6); // a Sunday
  assert.equal(mondayIndex(new Date(Date.UTC(2026, 7, 3))), 0); // a Monday
});

test('a stored date keys to its own calendar day, never a neighbouring one', () => {
  // Postgres hands a `date` back as UTC midnight. Reading it in any other
  // zone is what moves a Monday session onto Sunday.
  assert.equal(dayKey(new Date(Date.UTC(2026, 7, 1))), '2026-08-01');
  assert.equal(dayKey(new Date('2026-08-01T00:00:00.000Z')), '2026-08-01');
});

test('the month either side rolls the year over', () => {
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, month: 11 });
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth(2026, 7, 1), { year: 2026, month: 8 });
  // Paging a long way forward, which is the point of the client's calendar.
  assert.deepEqual(shiftMonth(2026, 7, 6), { year: 2027, month: 1 });
});

test('a junk month in the URL shows this month rather than throwing', () => {
  const now = new Date(Date.UTC(2026, 7, 28));
  assert.deepEqual(parseMonth('nonsense', now), { year: 2026, month: 7 });
  assert.deepEqual(parseMonth(undefined, now), { year: 2026, month: 7 });
  assert.deepEqual(parseMonth('2026-13', now), { year: 2026, month: 7 });
  assert.deepEqual(parseMonth('2026-00', now), { year: 2026, month: 7 });
  assert.deepEqual(parseMonth('2027-03', now), { year: 2027, month: 2 });
});

test('month keys round-trip through the URL', () => {
  assert.equal(monthKey(2026, 0), '2026-01');
  assert.equal(monthKey(2026, 11), '2026-12');
  assert.deepEqual(parseMonth(monthKey(2026, 8)), { year: 2026, month: 8 });
});

test('the squares either side of the month are not counted as part of it', () => {
  const grid = monthGrid(2026, 7);
  const counted = grid.days.filter((d) => inMonth(d, 2026, 7));
  assert.equal(counted.length, 31, 'August has 31 days and no more');
  assert.ok(!inMonth(new Date(Date.UTC(2026, 6, 31)), 2026, 7));
  assert.ok(!inMonth(new Date(Date.UTC(2027, 7, 1)), 2026, 7), 'same month, wrong year');
});
