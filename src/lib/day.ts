/*
  What day it is, for the person whose day it is.

  Every date column in this schema is `@db.Date` — a calendar date with no
  time and no zone. Postgres hands one back as UTC midnight, which is fine;
  the bug was on the way in. Ten copies of this function had accumulated
  across the app:

      function todayDateOnly() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
      }

  On Vercel the server runs in UTC, so that is UTC midnight, and it is wrong
  for everyone west of Greenwich. A client in Los Angeles logging dinner at
  7pm is at 02:00 UTC the following day, so the meal is filed against
  tomorrow. Three things follow, and all of them were happening:

    - Their own screen resets at 5pm local. Breakfast and lunch vanish and
      they see a full calorie budget having already eaten 1,400.
    - The coach's meals queue sums only that dinner, flags the day `under`,
      and pre-writes "Youre only at 900 for the whole day though" to a client
      who ate 2,300 — the queue confidently saying the opposite of the truth.
    - Steps posted by an iOS shortcut at 11pm land on tomorrow, so the Today
      screen reads zero all day.

  So a day is always relative to a timezone, and every caller has to name
  one. `Profile.timezone` already exists and already defaults to
  America/New_York, so this needs no migration and no new column — the
  information was sitting there being used only for booking.
*/

import { zonedTimeToUtc } from '@/lib/schedule';

export const DEFAULT_TZ = 'America/New_York';

/**
 * Formatters are expensive to construct and these repeat per row, so they're
 * kept. The set of distinct timezones across a client roster is tiny.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    // en-CA gives YYYY-MM-DD, which is the only reason to pick a locale here.
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/**
 * An IANA zone from a profile, or the default.
 *
 * A bad string would throw inside Intl on every render, which is a far worse
 * outcome than quietly falling back — so it's validated once, here, rather
 * than trusted at each of the call sites.
 */
export function zoneOf(profile: { timezone?: string | null } | null | undefined): string {
  const tz = profile?.timezone?.trim();
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/**
 * Which calendar date an instant fell on, in `tz`.
 *
 * Returned as the UTC midnight of that date, because that is the shape
 * `@db.Date` round-trips and every existing comparison in the app is
 * against a value of that shape.
 */
export function dayIn(instant: Date, tz: string | null | undefined): Date {
  const zone = typeof tz === 'string' && tz ? zoneOf({ timezone: tz }) : DEFAULT_TZ;
  const [y, m, d] = formatterFor(zone).format(instant).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** The date it is right now for someone in `tz`. */
export function todayIn(tz: string | null | undefined, now: Date = new Date()): Date {
  return dayIn(now, tz);
}

/**
 * N days before today in `tz`.
 *
 * Stepping in UTC after the zone has already been applied is correct and
 * deliberate: the result is a calendar date, and calendar dates are exactly
 * 24h apart even across a DST boundary that makes the underlying day 23 or
 * 25 hours long. Subtracting from the instant instead would skip or repeat a
 * date twice a year.
 */
export function daysAgoIn(n: number, tz: string | null | undefined, now: Date = new Date()): Date {
  const t = todayIn(tz, now);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - n));
}

/**
 * The instant at which today's local midnight occurred.
 *
 * Distinct from `todayIn`, and mixing the two up is its own bug. `todayIn`
 * returns the UTC midnight that a `@db.Date` column round-trips — a label for
 * a calendar date, not a moment. Bounding a real timestamp with it is wrong
 * by the zone offset: in New York, `todayIn` is 8pm the previous evening, so
 * `startedAt >= todayIn(...)` picks up last night's session as today's, and
 * this morning's sets get appended to it.
 *
 * Use `todayIn` against `@db.Date` columns and this against `DateTime` ones.
 */
export function startOfDayInstant(tz: string | null | undefined, now: Date = new Date()): Date {
  return startOfDay(dayIn(now, tz), tz);
}

/**
 * The same thing for a named calendar date rather than for "now".
 *
 * Needed once the client can page back through their week: bounding
 * Thursday's session by Thursday's local midnight is the same problem as
 * bounding today's, and it must not quietly become the server's midnight
 * because the date arrived from a URL instead of a clock.
 */
export function startOfDay(day: Date, tz: string | null | undefined): Date {
  const zone = typeof tz === 'string' && tz ? zoneOf({ timezone: tz }) : DEFAULT_TZ;
  return zonedTimeToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 0, zone);
}

/**
 * The hour of the clock on someone's wall, 0–23.
 *
 * For greetings and anything else that keys off time of day. `getHours()` on
 * the server is UTC, which greeted a client in Los Angeles with "Good
 * morning" at 8pm.
 */
export function hourIn(tz: string | null | undefined, now: Date = new Date()): number {
  const zone = typeof tz === 'string' && tz ? zoneOf({ timezone: tz }) : DEFAULT_TZ;
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hour12: false }).format(now)
  );
}

/** Anything carrying a profile — a session user, a joined client row. */
export type HasProfile = { profile?: { timezone?: string | null } | null } | null | undefined;

/**
 * The date it is now for this person.
 *
 * The shape every call site wants, and short enough that reaching for the
 * old local `todayDateOnly()` never looks easier. `getCurrentUser()` already
 * includes the profile, so this costs no extra query anywhere it's used.
 */
export function todayFor(u: HasProfile, now: Date = new Date()): Date {
  return dayIn(now, zoneOf(u?.profile));
}

/** The instant this person's day began. For bounding DateTime columns. */
export function startOfDayInstantFor(u: HasProfile, now: Date = new Date()): Date {
  return startOfDayInstant(zoneOf(u?.profile), now);
}

/** N days before this person's today. */
export function daysAgoFor(n: number, u: HasProfile, now: Date = new Date()): Date {
  return daysAgoIn(n, zoneOf(u?.profile), now);
}

/**
 * Normalize a date that came out of the database.
 *
 * Distinct from everything above, and the distinction matters: a `@db.Date`
 * read is already UTC midnight of the right calendar date, so re-interpreting
 * it in a timezone would shift it. Use this on values from the DB and the
 * functions above on instants from the clock.
 */
export function dayOfStored(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

