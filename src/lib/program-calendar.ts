/*
  The program calendar's arithmetic, with no database in it.

  A Trainerize-style program is laid out in Day N, not dates: Day 1 is the
  first day of the program, Day 8 is the first day of week 2, and phases sit
  end to end ("Week 1 - 4", then "Week 5 - 8"). Nothing has a real date until
  the program is deployed onto a client, and then Day N becomes
  startDate + (N - 1).

  Everything that turns one of those into another lives here so it can be
  tested: where each phase starts, what a weekly repeat expands to, copying a
  week, stamping a seven-day pattern across a phase, what a resize does to the
  days after it, and the rows a deploy writes. The server actions and the
  deploy only read rows and write what these decide.

  "Weekday" in this file means the position in the program's week, 1..7 —
  Day 1 of week 1 is position 1 whatever day of the week the client starts
  on. A coach who starts everyone on a Monday can read 1 as Monday.
*/

export const CALENDAR_KINDS = [
  'workout',
  'cardio',
  'rest',
  'photos',
  'bodystats',
  'checkin',
  'message',
] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export function isCalendarKind(raw: unknown): raw is CalendarKind {
  return typeof raw === 'string' && (CALENDAR_KINDS as readonly string[]).includes(raw);
}

export const KIND_LABELS: Record<CalendarKind, string> = {
  workout: 'Workout',
  cardio: 'Cardio',
  rest: 'Rest day',
  photos: 'Progress photos',
  bodystats: 'Body stats',
  checkin: 'Check-in',
  message: 'Message',
};

/** A program can't run longer than a deploy can write. */
export const MAX_PROGRAM_WEEKS = 52;
export const MAX_DAY = MAX_PROGRAM_WEEKS * 7;

/** Stands in for the phase a template has before any phase row exists. */
export const IMPLICIT_PHASE_ID = 'implicit';

export type PhaseLike = { id: string; weeks: number };
export type PhaseRange = {
  id: string;
  /** 1-based day the phase starts on. */
  startDay: number;
  /** Last day, inclusive. */
  endDay: number;
  startWeek: number;
  endWeek: number;
};

export function clampWeeks(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PROGRAM_WEEKS);
}

/** Phases laid end to end, in the order given. */
export function phaseRanges(phases: PhaseLike[]): PhaseRange[] {
  const out: PhaseRange[] = [];
  let week = 1;
  for (const p of phases) {
    const weeks = clampWeeks(p.weeks);
    out.push({
      id: p.id,
      startDay: (week - 1) * 7 + 1,
      endDay: (week - 1 + weeks) * 7,
      startWeek: week,
      endWeek: week + weeks - 1,
    });
    week += weeks;
  }
  return out;
}

/** "Week 1 - 4", the way Trainerize names a phase until the coach renames it. */
export function defaultPhaseName(startWeek: number, weeks: number) {
  const end = startWeek + Math.max(1, weeks) - 1;
  return end === startWeek ? `Week ${startWeek}` : `Week ${startWeek} - ${end}`;
}

/**
 * The one phase a template has before the coach ever touches phases: long
 * enough to show everything already on its calendar, and at least four weeks
 * so an empty program still has a calendar to put things on.
 */
export function implicitPhase(items: { dayIndex: number }[]) {
  const last = items.reduce((m, i) => Math.max(m, i.dayIndex), 0);
  const weeks = clampWeeks(Math.max(4, Math.ceil(last / 7)));
  return { id: IMPLICIT_PHASE_ID, name: defaultPhaseName(1, weeks), weeks, summary: null as string | null };
}

/**
 * How many week rows the calendar draws: every phase, plus any week an item
 * sits in past the last phase — an item is never hidden just because a phase
 * was shortened under it.
 */
export function programWeeks(phases: PhaseLike[], items: { dayIndex: number }[]) {
  const phaseWeeks = phases.reduce((s, p) => s + clampWeeks(p.weeks), 0);
  const last = items.reduce((m, i) => Math.max(m, i.dayIndex), 0);
  return Math.min(MAX_PROGRAM_WEEKS, Math.max(phaseWeeks, Math.ceil(last / 7), 1));
}

export function weekOf(dayIndex: number) {
  return Math.floor((dayIndex - 1) / 7) + 1;
}

/** Position within the program's week, 1..7. */
export function weekdayOf(dayIndex: number) {
  return ((dayIndex - 1) % 7) + 1;
}

export function dayIndexFor(week: number, weekday: number) {
  return (week - 1) * 7 + weekday;
}

export function phaseForDay<T extends { startDay: number; endDay: number }>(ranges: T[], dayIndex: number): T | null {
  return ranges.find((r) => dayIndex >= r.startDay && dayIndex <= r.endDay) ?? null;
}

export function isValidDay(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= MAX_DAY;
}

/* ------------------------------------------------------------------------ */
/* Repeats                                                                   */
/* ------------------------------------------------------------------------ */

export type RepeatRule = {
  /** The day picked in the dialog — nothing is placed before it. */
  dayIndex: number;
  /** Positions in the week, 1..7. */
  weekdays: number[];
  /** Repeat for this many weeks, counting the picked day's week as week one. */
  weeks?: number;
  /** Or: up to and including this day (the end of the phase). */
  untilDay?: number;
};

/**
 * Every day a weekly repeat lands on, in order.
 *
 * "Every Mon/Wed/Fri for 4 weeks" from Day 3 (a Wednesday when Day 1 is a
 * Monday) is Days 3, 5, 8, 10, 12, ... — the picked week's Monday is already
 * behind the picked day, so it is skipped rather than placed in the past.
 * With no weekdays ticked it is just the picked day.
 */
export function expandRepeat(rule: RepeatRule): number[] {
  const start = rule.dayIndex;
  if (!isValidDay(start)) return [];
  const days = [...new Set(rule.weekdays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort(
    (a, b) => a - b
  );
  if (days.length === 0) return [start];

  const firstWeek = weekOf(start);
  let lastDay: number;
  if (rule.untilDay !== undefined) {
    lastDay = Math.min(rule.untilDay, MAX_DAY);
  } else {
    const weeks = clampWeeks(rule.weeks ?? 1);
    lastDay = Math.min(dayIndexFor(firstWeek + weeks - 1, 7), MAX_DAY);
  }

  const out: number[] = [];
  for (let w = firstWeek; dayIndexFor(w, 1) <= lastDay; w += 1) {
    for (const d of days) {
      const idx = dayIndexFor(w, d);
      if (idx >= start && idx <= lastDay) out.push(idx);
    }
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Copy a week, stamp a pattern, resize a phase                              */
/* ------------------------------------------------------------------------ */

export type ItemFields = {
  kind: string;
  workoutId: string | null;
  cardioTypeId: string | null;
  cardioMinutes: number | null;
  cardioTarget: string | null;
  stepTarget: number | null;
  label: string | null;
  note: string | null;
};

export type CalendarItemLike = ItemFields & { id: string; dayIndex: number; position?: number };

export function itemFields(i: ItemFields): ItemFields {
  return {
    kind: i.kind,
    workoutId: i.workoutId,
    cardioTypeId: i.cardioTypeId,
    cardioMinutes: i.cardioMinutes,
    cardioTarget: i.cardioTarget,
    stepTarget: i.stepTarget,
    label: i.label,
    note: i.note,
  };
}

/**
 * Week `fromWeek`'s items, re-dated onto each target week. The source week
 * itself is never a target — copying a week onto itself would double it.
 */
export function copyWeek<T extends CalendarItemLike>(items: T[], fromWeek: number, toWeeks: number[]) {
  const source = items.filter((i) => weekOf(i.dayIndex) === fromWeek);
  const targets = [...new Set(toWeeks)].filter(
    (w) => Number.isInteger(w) && w >= 1 && w !== fromWeek && w <= MAX_PROGRAM_WEEKS
  );
  const out: (ItemFields & { dayIndex: number; position: number })[] = [];
  for (const w of targets) {
    for (const i of source) {
      out.push({ ...itemFields(i), dayIndex: dayIndexFor(w, weekdayOf(i.dayIndex)), position: i.position ?? 0 });
    }
  }
  return out;
}

/** One slot of a seven-day pattern: what goes on that position every week. */
export type PatternEntry = Omit<ItemFields, 'note'> & { note?: string | null };

/**
 * A seven-slot week stamped across a phase: slot 1 lands on the phase's first
 * day of every week, slot 2 on the second, and so on. An empty slot is a day
 * with nothing on it, which is a fine way to describe a program.
 */
export function stampPattern(pattern: PatternEntry[][], range: Pick<PhaseRange, 'startDay' | 'endDay'>) {
  const out: (ItemFields & { dayIndex: number; position: number })[] = [];
  for (let day = range.startDay; day <= range.endDay; day += 1) {
    const slot = pattern[(day - range.startDay) % 7] ?? [];
    slot.forEach((e, position) => {
      out.push({
        kind: e.kind,
        workoutId: e.workoutId,
        cardioTypeId: e.cardioTypeId,
        cardioMinutes: e.cardioMinutes,
        cardioTarget: e.cardioTarget,
        stepTarget: e.stepTarget,
        label: e.label,
        note: e.note ?? null,
        dayIndex: day,
        position,
      });
    });
  }
  return out;
}

/**
 * The old repeating week (ISO weekday 1 = Monday) as a seven-slot pattern.
 * Monday becomes slot 1 — so for a client who starts on a Monday, filling a
 * phase from the old week gives exactly the calendar the old deploy wrote.
 */
export function patternFromWeek(
  days: {
    weekday: number;
    kind: string;
    workoutId: string | null;
    label: string | null;
    cardioTypeId: string | null;
    cardioMinutes: number | null;
    stepTarget: number | null;
  }[]
): PatternEntry[][] {
  const pattern: PatternEntry[][] = [[], [], [], [], [], [], []];
  for (const d of days) {
    if (d.weekday < 1 || d.weekday > 7) continue;
    // A "workout" weekday with no session picked would deploy as a Start
    // button that opens nothing.
    if (d.kind === 'workout' && !d.workoutId) continue;
    pattern[d.weekday - 1].push({
      kind: d.kind,
      workoutId: d.kind === 'workout' ? d.workoutId : null,
      cardioTypeId: d.cardioTypeId,
      cardioMinutes: d.cardioMinutes,
      cardioTarget: null,
      stepTarget: d.stepTarget,
      label: d.label,
    });
  }
  return pattern;
}

/**
 * What changing a phase's length does to the calendar.
 *
 * Longer: every item after the phase slides later by the added days, so the
 * next phase still starts right after it. Shorter: items in the cut weeks go,
 * and everything after slides earlier. `newWeeks` of 0 is deleting the phase.
 * Items inside the kept part of the phase never move.
 */
export function resizePhase<T extends { id: string; dayIndex: number }>(
  items: T[],
  range: Pick<PhaseRange, 'startDay' | 'endDay'>,
  newWeeks: number
) {
  const newEnd = range.startDay - 1 + Math.max(0, Math.round(newWeeks)) * 7;
  const delta = newEnd - range.endDay;
  const removeIds: string[] = [];
  const shifts: { id: string; dayIndex: number }[] = [];
  for (const i of items) {
    if (i.dayIndex < range.startDay) continue;
    if (i.dayIndex <= range.endDay) {
      if (i.dayIndex > newEnd) removeIds.push(i.id);
      continue;
    }
    if (delta !== 0) shifts.push({ id: i.id, dayIndex: i.dayIndex + delta });
  }
  return { removeIds, shifts, delta };
}

/* ------------------------------------------------------------------------ */
/* Deploy: Day N -> dates                                                    */
/* ------------------------------------------------------------------------ */

/** Day N of a program that starts on `start` (a UTC-midnight date). */
export function dateForDay(start: Date, dayIndex: number): Date {
  return new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + dayIndex - 1)
  );
}

export function sourceKeyFor(itemId: string, cycle = 0) {
  return `ci:${itemId}:${cycle}`;
}

export function parseSourceKey(key: string | null | undefined) {
  const m = /^ci:(.+):(\d+)$/.exec(key ?? '');
  return m ? { itemId: m[1], cycle: Number(m[2]) } : null;
}

export type MaterialItem = CalendarItemLike & {
  workout?: { name: string } | null;
  cardioType?: { name: string } | null;
};

/** What a row is called on a calendar chip and on Today. */
export function itemLabel(i: MaterialItem): string {
  const custom = i.label?.trim();
  switch (i.kind) {
    case 'workout':
      return i.workout?.name ?? custom ?? 'Workout';
    case 'cardio': {
      const name = custom || i.cardioType?.name || 'Cardio';
      return i.cardioMinutes ? `${name} · ${i.cardioMinutes} min` : name;
    }
    case 'rest':
      return custom || 'Rest day';
    case 'message':
      return custom || 'Message from coach';
    default:
      return custom || KIND_LABELS[i.kind as CalendarKind] || i.kind;
  }
}

export type MaterialRow = {
  date: Date;
  kind: string;
  label: string;
  workoutId: string | null;
  cardioTypeId: string | null;
  cardioMinutes: number | null;
  cardioTarget: string | null;
  stepTarget: number | null;
  note: string | null;
  sourceKey: string;
};

/**
 * The dated rows one deploy writes from a program's calendar items.
 *
 * Several rows per day are fine and expected. Items past `totalDays` are left
 * off (they sit beyond the program's end), and a workout item whose workout
 * is gone is skipped rather than written as a Start button to nowhere.
 * `skipKinds` lets the caller leave out what a client can't receive — a
 * Follow My Split member has no message thread.
 */
export function materialize(
  items: MaterialItem[],
  startDate: Date,
  totalDays: number,
  opts: { cycle?: number; skipKinds?: string[] } = {}
): MaterialRow[] {
  const skip = new Set(opts.skipKinds ?? []);
  return [...items]
    .filter((i) => i.dayIndex >= 1 && i.dayIndex <= totalDays && !skip.has(i.kind))
    .filter((i) => i.kind !== 'workout' || (i.workoutId && i.workout !== null))
    .sort((a, b) => a.dayIndex - b.dayIndex || (a.position ?? 0) - (b.position ?? 0))
    .map((i) => ({
      date: dateForDay(startDate, i.dayIndex),
      kind: i.kind,
      label: itemLabel(i),
      workoutId: i.kind === 'workout' ? i.workoutId : null,
      cardioTypeId: i.cardioTypeId,
      cardioMinutes: i.cardioMinutes,
      cardioTarget: i.cardioTarget,
      stepTarget: i.stepTarget,
      note: i.note,
      sourceKey: sourceKeyFor(i.id, opts.cycle ?? 0),
    }));
}

/* ------------------------------------------------------------------------ */
/* A day with several things on it                                          */
/* ------------------------------------------------------------------------ */

const DAY_ORDER: Record<string, number> = {
  workout: 0,
  cardio: 1,
  photos: 2,
  bodystats: 3,
  checkin: 4,
  rest: 5,
  message: 6,
};

/** The order a day's items are read in: the lift first, rest last. */
export function orderDayItems<T extends { kind: string; position?: number | null }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (DAY_ORDER[a.kind] ?? 9) - (DAY_ORDER[b.kind] ?? 9) || (a.position ?? 0) - (b.position ?? 0)
  );
}

/** Kinds that are training. A day with any of these is not a rest day. */
export const TRAINING_KINDS = ['workout', 'cardio'];

/**
 * A rest day is a day with a rest item and no training on it. A photo
 * reminder on a rest day keeps it a rest day; a lift that the coach dropped
 * onto it does not.
 */
export function isRestDay(kinds: string[]) {
  return kinds.includes('rest') && !kinds.some((k) => TRAINING_KINDS.includes(k));
}

/** The clients, out of a day's rows, whose day is a rest day. */
export function restingClients(rows: { clientId: string; kind: string }[]) {
  const kinds = new Map<string, string[]>();
  for (const r of rows) {
    const list = kinds.get(r.clientId) ?? [];
    list.push(r.kind);
    kinds.set(r.clientId, list);
  }
  return new Set([...kinds].filter(([, k]) => isRestDay(k)).map(([id]) => id));
}

/* ------------------------------------------------------------------------ */
/* Reading form input                                                        */
/* ------------------------------------------------------------------------ */

export type ItemInput = {
  kind: string;
  workoutId?: string | null;
  cardioTypeId?: string | null;
  cardioMinutes?: number | string | null;
  cardioTarget?: string | null;
  stepTarget?: number | string | null;
  label?: string | null;
  note?: string | null;
};

function intIn(raw: unknown, min: number, max: number): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < min) return null;
  return Math.min(n, max);
}

function text(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t ? t.slice(0, max) : null;
}

/**
 * The Add Activity dialog's fields, cleaned and made consistent with the
 * kind: a workout id only on a workout, cardio fields only on cardio, and a
 * message must say something. Ownership of the ids is the caller's job.
 */
export function cleanItemInput(input: ItemInput): { ok: true; fields: ItemFields } | { ok: false; reason: string } {
  if (!isCalendarKind(input.kind)) return { ok: false, reason: 'Pick what to schedule.' };
  const kind = input.kind;
  const fields: ItemFields = {
    kind,
    workoutId: kind === 'workout' ? text(input.workoutId, 64) : null,
    cardioTypeId: kind === 'cardio' ? text(input.cardioTypeId, 64) : null,
    cardioMinutes: kind === 'cardio' ? intIn(input.cardioMinutes, 1, 600) : null,
    cardioTarget: kind === 'cardio' ? text(input.cardioTarget, 500) : null,
    // Steps ride on any training or rest day, the way the old week had them.
    stepTarget: ['workout', 'cardio', 'rest'].includes(kind) ? intIn(input.stepTarget, 1, 100000) : null,
    label: text(input.label, 80),
    note: text(input.note, 2000),
  };
  if (kind === 'workout' && !fields.workoutId) return { ok: false, reason: 'Pick a workout.' };
  if (kind === 'cardio' && !fields.cardioTypeId && !fields.label) {
    return { ok: false, reason: 'Pick a cardio type, or give it a name.' };
  }
  if (kind === 'message' && !fields.note) return { ok: false, reason: 'Write the message.' };
  return { ok: true, fields };
}
