/*
  Moving sessions around a client's calendar, with no database in it.

  A day holds at most one SESSION — a lift or a rest day — though it can carry
  cardio, reminders and messages beside it (a program calendar can put a lift,
  a swim and a photo reminder on one day). The rest-day automatic message
  looks for a rest row with no training on the day, and the coach's month
  header counts workouts. So dragging Monday's chest day onto Wednesday cannot
  just stack it on top of Wednesday's rest day — the client would open the app
  on Wednesday and see a lift and a rest day at once.

  The rule is the one a coach actually means: drop a session on a day and the
  two days trade places. Monday's lift goes to Wednesday, Wednesday's rest goes
  to Monday. Dropping onto an empty day is a plain move.

  Two things never move:

  - A finished session. It is a record of something that happened on that
    date, not a plan. Dragging it would rewrite history and quietly un-tick
    the day it was actually done.
  - Anything finished on the target day. It stays where it is and the moved
    session sits beside it. That is the only way a day ends up with two
    chips, and it is honest: they really did train that day and they really
    were asked to do the moved session.

  Everything here works on "YYYY-MM-DD" keys so it can be tested without
  thinking about timezones. The callers turn those into UTC-midnight dates,
  which is the shape every `@db.Date` column in the app round-trips.
*/

export type PlanItem = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: string; // workout | cardio | rest | photos | bodystats | checkin | message
  completed: boolean;
};

export type PlanResult =
  | { ok: true; moves: { id: string; date: string }[] }
  | { ok: false; reason: string };

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD form — "2026-02-30" is not one. */
export function isDayKey(raw: unknown): raw is string {
  if (typeof raw !== 'string' || !DAY_KEY.test(raw)) return false;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}

export function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

export function dateToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function shiftKey(key: string, days: number): string {
  const d = keyToDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToKey(d);
}

/**
 * What has to change to put `item` on `to`.
 *
 * `targetDay` is everything currently on the destination date. Unfinished
 * rows there come back to the item's old date (the swap); finished ones stay.
 */
export function planMove(item: PlanItem, to: string, targetDay: PlanItem[]): PlanResult {
  if (!isDayKey(to)) return { ok: false, reason: "That date didn't read." };
  if (item.completed) {
    return { ok: false, reason: 'That one is already done — it stays on the day they did it.' };
  }
  if (item.date === to) return { ok: true, moves: [] };

  const moves = [{ id: item.id, date: to }];
  /*
    Only the day's session trades places. A day can now hold several things —
    a lift, a swim, a photo reminder — and dragging the swim onto Tuesday
    should add a swim to Tuesday, not send Tuesday's lift back the other way.
    So a lift or a rest day swaps with the lift or rest day it lands on, and
    everything else (cardio, reminders, messages) simply moves.
  */
  if (!SESSION_KINDS.includes(item.kind)) return { ok: true, moves };
  for (const other of targetDay) {
    // The item itself can't be on the target day (dates differ), but a stale
    // read could hand it back; never move one row twice.
    if (other.id === item.id || other.completed) continue;
    if (!SESSION_KINDS.includes(other.kind)) continue;
    moves.push({ id: other.id, date: item.date });
  }
  return { ok: true, moves };
}

/** What a day is "about": one of these, and only one, per day. */
export const SESSION_KINDS = ['workout', 'rest'];

/** How far a "push everything back" may go in one go. A month is a holiday. */
export const MAX_SHIFT_DAYS = 30;

/**
 * Push every unfinished session from `from` onward forward by `days`.
 *
 * The missed-a-day button: a client is ill on Tuesday, and rather than
 * dragging six months of sessions one at a time, everything from Tuesday on
 * slides back a day and the program keeps its order. Finished sessions stay
 * put for the same reason they never move.
 *
 * Forward only. Pulling sessions earlier would run them into days that are
 * not being shifted and stack two sessions on one date.
 */
export function planShift(items: PlanItem[], from: string, days: number): PlanResult {
  if (!isDayKey(from)) return { ok: false, reason: "That date didn't read." };
  if (!Number.isInteger(days) || days < 1 || days > MAX_SHIFT_DAYS) {
    return { ok: false, reason: `Push back between 1 and ${MAX_SHIFT_DAYS} days.` };
  }
  const moves = items
    .filter((i) => !i.completed && i.date >= from)
    .map((i) => ({ id: i.id, date: shiftKey(i.date, days) }));
  return { ok: true, moves };
}

/**
 * The one session the client is shown for a day.
 *
 * A day should only ever hold one, but the swap rule above deliberately lets
 * a finished session sit beside a moved one. When that happens the Today
 * screen should lead with what is still to do, and a lift over cardio over
 * rest — "rest" winning because Postgres happened to return it first is how
 * a client gets told to take the day off on a training day.
 */
const PRIORITY: Record<string, number> = { workout: 0, cardio: 1, rest: 2 };

export function pickPrimary<T extends { kind: string; completedAt?: Date | null }>(
  items: T[]
): T | null {
  if (items.length === 0) return null;
  // Kind first, so a finished lift still beats an outstanding rest day — the
  // client trained, and "rest" is the wrong thing to show them. Within a kind,
  // what is still to do comes first.
  return [...items].sort((a, b) => {
    const byKind = (PRIORITY[a.kind] ?? 9) - (PRIORITY[b.kind] ?? 9);
    if (byKind !== 0) return byKind;
    return (a.completedAt ? 1 : 0) - (b.completedAt ? 1 : 0);
  })[0];
}
