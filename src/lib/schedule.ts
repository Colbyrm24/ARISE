/*
  Turning "Tuesdays 9 to 5" into actual bookable instants.

  This is the part of scheduling that goes wrong. A coach means nine in the
  morning where they live, and that has to stay nine in the morning across a
  daylight saving change, which means the UTC instant it corresponds to moves
  by an hour twice a year. Storing absolute times would be simpler and would
  silently shift every call in November.

  Everything here is pure and takes the current time as an argument, so the
  DST cases can actually be tested rather than reasoned about.
*/

export type Availability = {
  /** 0 = Sunday through 6 = Saturday. */
  weekday: number;
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
};

export type Slot = { startsAt: Date; endsAt: Date };

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** "9:30 am" from minutes-from-midnight, for the availability editor. */
export function formatMinute(minute: number) {
  const h24 = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const period = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function parseTimeToMinute(value: string): number | null {
  // Accepts what <input type="time"> sends, which is always "HH:MM".
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * The parts of an instant as they read in a given timezone.
 *
 * Intl is the only thing in the platform that knows the DST rules, so it does
 * the work rather than a table of offsets that would rot.
 */
function partsIn(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    // Intl renders midnight as hour 24 in some engines; normalize it.
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WD.indexOf(out.weekday),
  };
}

/** The timezone's offset from UTC, in minutes, at a given instant. */
function offsetMinutes(date: Date, timeZone: string) {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - date.getTime()) / 60000;
}

/**
 * The instant at which a given wall-clock time occurs in a timezone.
 *
 * Two passes, because the offset depends on the instant and the instant
 * depends on the offset. The first guess uses the offset at the naive time,
 * the second corrects it — which is what makes the hour either side of a DST
 * boundary land correctly instead of an hour out.
 */
export function zonedTimeToUtc(
  y: number,
  m: number,
  d: number,
  minutes: number,
  timeZone: string
): Date {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const naive = Date.UTC(y, m - 1, d, hour, minute, 0);

  const firstOffset = offsetMinutes(new Date(naive), timeZone);
  const firstGuess = new Date(naive - firstOffset * 60000);

  const secondOffset = offsetMinutes(firstGuess, timeZone);
  if (secondOffset === firstOffset) return firstGuess;
  return new Date(naive - secondOffset * 60000);
}

/**
 * The calendar date in the coach's timezone, n days after `from`.
 *
 * Stepped as CALENDAR dates, not by adding 86,400,000ms.
 *
 * The millisecond version drifts the local wall-clock time by an hour across
 * a DST transition, and when the starting local hour sits near the edge that
 * drift rolls the date over. Checked against the real ICU rules: from
 * Saturday 8 March 2025 at 23:30 America/New_York, offsets 0, 1 and 2
 * produced March 8, 10 and 11 — Sunday the 9th was never generated, so a
 * client opening /book late that Saturday saw no Sunday times at all,
 * whatever the coach had set for Sundays. Fall-back does the mirror from a
 * 00:30 start: a day repeats and the window comes up one short at the end.
 *
 * `Date.UTC(y, m - 1, d + n)` normalises month and year rollover, and a
 * calendar day is exactly one calendar day however many hours it actually
 * ran. Read back at noon so no rendering of that date can slip to a
 * neighbouring one. zonedTimeToUtc still does the real DST work on the
 * resulting date — this only decides WHICH dates get asked about.
 */
function dayIn(from: Date, dayOffset: number, timeZone: string) {
  const base = partsIn(from, timeZone);
  const stepped = new Date(Date.UTC(base.year, base.month - 1, base.day + dayOffset, 12));
  return {
    year: stepped.getUTCFullYear(),
    month: stepped.getUTCMonth() + 1,
    day: stepped.getUTCDate(),
    weekday: stepped.getUTCDay(),
  };
}

/**
 * Every bookable slot between now and `days` ahead.
 *
 * Slots already booked are removed, and so is anything less than `leadMinutes`
 * away — a client should not be able to book a call that starts in four
 * minutes, and the coach should not have to decline it.
 */
export function bookableSlots(options: {
  availability: Availability[];
  timeZone: string;
  from: Date;
  days: number;
  bookedStarts: Set<number>;
  leadMinutes?: number;
}): Slot[] {
  const { availability, timeZone, from, days, bookedStarts } = options;
  const leadMinutes = options.leadMinutes ?? 120;
  const earliest = from.getTime() + leadMinutes * 60000;

  const byWeekday = new Map<number, Availability[]>();
  for (const a of availability) {
    if (a.slotMinutes <= 0 || a.endMinute <= a.startMinute) continue;
    const list = byWeekday.get(a.weekday) ?? [];
    list.push(a);
    byWeekday.set(a.weekday, list);
  }
  if (byWeekday.size === 0) return [];

  const slots: Slot[] = [];

  for (let offset = 0; offset <= days; offset++) {
    const day = dayIn(from, offset, timeZone);
    const windows = byWeekday.get(day.weekday);
    if (!windows) continue;

    for (const w of windows) {
      for (let minute = w.startMinute; minute + w.slotMinutes <= w.endMinute; minute += w.slotMinutes) {
        const startsAt = zonedTimeToUtc(day.year, day.month, day.day, minute, timeZone);
        if (startsAt.getTime() < earliest) continue;
        if (bookedStarts.has(startsAt.getTime())) continue;
        slots.push({
          startsAt,
          endsAt: new Date(startsAt.getTime() + w.slotMinutes * 60000),
        });
      }
    }
  }

  // Two overlapping windows on one day can produce the same start twice.
  const seen = new Set<number>();
  return slots
    .filter((s) => {
      const key = s.startsAt.getTime();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Groups slots into days as they read in the given timezone, for rendering. */
export function groupByDay(slots: Slot[], timeZone: string) {
  const groups = new Map<string, { label: string; slots: Slot[] }>();
  for (const slot of slots) {
    const p = partsIn(slot.startsAt, timeZone);
    const key = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    const existing = groups.get(key);
    if (existing) {
      existing.slots.push(slot);
    } else {
      groups.set(key, {
        label: new Intl.DateTimeFormat('en-US', {
          timeZone,
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        }).format(slot.startsAt),
        slots: [slot],
      });
    }
  }
  return [...groups.values()];
}

/** "9:30 AM" in the reader's own timezone, whoever they are. */
export function formatSlotTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatSlotFull(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}
