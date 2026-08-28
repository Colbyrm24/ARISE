/*
  The shape of a month, with no database and no React in it.

  Two screens draw a calendar now — the coach looking at a client, and the
  client looking at themselves — and every one of the fiddly parts is the
  same: which square a stored date lands on, where the grid starts, how many
  rows it has, and what `?m=` means. Those are exactly the parts that go
  wrong silently, so they live here where they can be tested directly.

  Everything is UTC on purpose. Every date in play — ScheduledItem.date,
  NutritionLog.date, WeightLog.date — is a Postgres `date`, which comes back
  as UTC midnight of the right calendar day. Mixing a local date into this
  grid is how a Monday session renders on Sunday for anybody east of London.
  Deciding what day an *instant* falls on is the other problem entirely and
  lives in @/lib/day.
*/

/** Monday first. A training week starts on Monday, not Sunday. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function utcDay(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}

export function addUtcDays(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

/** The key both the grid and the grouped database rows agree on. */
export function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** ISO weekday, Monday = 0, so it can be subtracted to reach the grid start. */
export function mondayIndex(d: Date) {
  const js = d.getUTCDay();
  return js === 0 ? 6 : js - 1;
}

export function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * `?m=2026-08`, or this month.
 *
 * Anything unparseable falls back rather than throwing: this value arrives
 * from the URL bar, and a mistyped month should show the current month, not
 * a 500 on the screen somebody uses to plan their week.
 */
export function parseMonth(raw: string | undefined, now: Date = new Date()) {
  const fallback = { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return fallback;
  const [y, m] = raw.split('-').map(Number);
  if (!Number.isFinite(y) || m < 1 || m > 12) return fallback;
  return { year: y, month: m - 1 };
}

/** The month before or after, rolling the year over. */
export function shiftMonth(year: number, month: number, delta: number) {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export type MonthGrid = {
  firstOfMonth: Date;
  /** Monday of the week the 1st falls in — the first square drawn. */
  gridStart: Date;
  /** The last square. Query ranges run gridStart..gridEnd inclusive. */
  gridEnd: Date;
  /** Always 42. See below. */
  days: Date[];
};

/**
 * Six rows, always.
 *
 * A month spans five or six calendar weeks depending on which day it starts,
 * and a grid that changes height as you page through the year reads as a bug
 * rather than as a calendar — the buttons under it move.
 */
export function monthGrid(year: number, month: number): MonthGrid {
  const firstOfMonth = utcDay(year, month, 1);
  const gridStart = addUtcDays(firstOfMonth, -mondayIndex(firstOfMonth));
  return {
    firstOfMonth,
    gridStart,
    gridEnd: addUtcDays(gridStart, 41),
    days: Array.from({ length: 42 }, (_, i) => addUtcDays(gridStart, i)),
  };
}

/** Whether a square belongs to the month being shown, or to its neighbours. */
export function inMonth(d: Date, year: number, month: number) {
  return d.getUTCMonth() === month && d.getUTCFullYear() === year;
}

export function monthLabel(year: number, month: number) {
  return utcDay(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
