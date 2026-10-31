import {
  dateForDay,
  materialize,
  phaseForDay,
  weekOf,
  type MaterialItem,
  type MaterialRow,
} from '@/lib/program-calendar';

/*
  Live sync from a master program to its subscribers, with no database in it.

  Colby's rule for editing a program people are already on: everyone's
  FUTURE days change; the past and anything finished never do. On top of
  that, a day he moved or replaced by hand on one client's calendar is
  pinned, and a sync must leave it — and must not write a second copy of it
  on the day the master says, either.

  So for one subscription the planner answers two questions: which of this
  client's rows of this template go, and which rows are written instead.

    - Only rows of THIS template are considered (the caller loads only
      those), and only ones dated from the client's own today onward, not
      completed and not pinned, can be deleted.
    - Every row the master currently implies is generated from the
      subscription's start date, and then dropped if it is in the past or if
      a pinned or completed row already carries its sourceKey.
    - A generated row identical to one already there keeps the existing row
      instead of a delete-and-recreate, so an edit to week 9 doesn't churn
      every row id from today to week 12.

  Cycles: a coaching client's program runs once, so a sync covers exactly
  one run — shortening the program really does take the cut weeks off their
  calendar. A Follow My Split member's calendar is topped up past the end
  and runs the program again (`repeats`), so for them it covers every cycle
  up to the last row they already have from this template: a sync must
  never shorten a calendar the top-up extended.
*/

export type ExistingRow = {
  id: string;
  date: Date;
  kind: string;
  label: string;
  workoutId: string | null;
  cardioTypeId: string | null;
  cardioMinutes: number | null;
  cardioTarget: string | null;
  stepTarget: number | null;
  note: string | null;
  sourceKey: string | null;
  completed: boolean;
  pinned: boolean;
};

export type SyncInput = {
  startDate: Date;
  /** The client's today, from their own timezone. */
  today: Date;
  items: MaterialItem[];
  /** The program's length in days (sum of phases, or past the last item). */
  totalDays: number;
  /** Kinds this client can't receive — a member with no message thread. */
  skipKinds?: string[];
  /** This client's rows of this template, any date. */
  existing: ExistingRow[];
  /** The program runs again after its end (a topped-up member calendar). */
  repeats?: boolean;
  /** Cover up to this date instead — how a top-up extends a calendar. */
  through?: Date;
  /**
   * sourceKeys the coach removed or replaced on this client's own calendar
   * (ClientProgram.skippedKeys). Never written again by a sync.
   */
  skippedKeys?: string[];
};

export type SyncPlan = {
  deleteIds: string[];
  create: MaterialRow[];
  /** Rows that already matched and were left alone. */
  kept: number;
  /** Set when the plan is deliberately empty, saying why. */
  skipped?: 'weekly-pattern';
};

function dayMs(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Two rows that would look the same on the client's calendar. */
function sameRow(a: MaterialRow, b: ExistingRow) {
  return (
    dayMs(a.date) === dayMs(b.date) &&
    a.sourceKey === b.sourceKey &&
    a.kind === b.kind &&
    a.label === b.label &&
    a.workoutId === b.workoutId &&
    a.cardioTypeId === b.cardioTypeId &&
    a.cardioMinutes === b.cardioMinutes &&
    a.cardioTarget === b.cardioTarget &&
    a.stepTarget === b.stepTarget &&
    a.note === b.note
  );
}

/**
 * Every row the master implies for this subscription, cycle by cycle, up to
 * `through` (inclusive). Cycle k starts on startDate + k x totalDays.
 */
export function desiredRows(
  items: MaterialItem[],
  startDate: Date,
  totalDays: number,
  through: Date,
  skipKinds: string[] = []
): MaterialRow[] {
  if (totalDays < 1) return [];
  const out: MaterialRow[] = [];
  const end = dayMs(through);
  // A hard stop well past anything a deploy writes, so a bad date can never
  // spin this loop.
  for (let k = 0; k < 60; k += 1) {
    const cycleStart = dateForDay(startDate, k * totalDays + 1);
    if (dayMs(cycleStart) > end) break;
    for (const row of materialize(items, cycleStart, totalDays, { cycle: k, skipKinds })) {
      if (dayMs(row.date) <= end) out.push(row);
    }
  }
  return out;
}

export function planSync(input: SyncInput): SyncPlan {
  const today = dayMs(input.today);

  /*
    A client deployed from the old repeating week has rows with no
    sourceKey. Syncing them would delete their whole future and stamp
    whatever is on the calendar so far — which, the day a coach puts the
    first item on a running program's calendar, is one item. So a
    subscription only follows the calendar once its rows came from it
    (re-adding the subscriber does that); until then it is left alone.
  */
  const future = input.existing.filter((r) => dayMs(r.date) >= today && !r.completed);
  if (future.length > 0 && !future.some((r) => r.sourceKey)) {
    return { deleteIds: [], create: [], kept: 0, skipped: 'weekly-pattern' };
  }

  const protectedKeys = new Set(
    input.existing.filter((r) => (r.pinned || r.completed) && r.sourceKey).map((r) => r.sourceKey as string)
  );
  // A row the coach took off this client's calendar stays off: without this
  // the very next master edit would see the occurrence missing and write it
  // straight back.
  for (const k of input.skippedKeys ?? []) protectedKeys.add(k);
  /*
    Only rows from this subscription's own run can go. Rows of this template
    dated before its start date are what an earlier deploy left — the old
    weekly pattern, or the previous run when the coach re-added the client
    with a later Day 1 — and the deploy deliberately kept them. A sync starts
    from startDate, so it would otherwise find them "unwanted" and delete the
    days between today and the new start on the next unrelated master edit.
  */
  const start = dayMs(input.startDate);
  const deletable = input.existing.filter(
    (r) => dayMs(r.date) >= today && dayMs(r.date) >= start && !r.completed && !r.pinned
  );

  const firstRunEnd = dayMs(dateForDay(input.startDate, input.totalDays));
  const lastExisting = input.existing.reduce((m, r) => Math.max(m, dayMs(r.date)), 0);
  const through = input.through
    ? input.through
    : new Date(input.repeats ? Math.max(firstRunEnd, lastExisting) : firstRunEnd);

  const wanted = desiredRows(input.items, input.startDate, input.totalDays, through, input.skipKinds).filter(
    (r) => dayMs(r.date) >= today && !protectedKeys.has(r.sourceKey)
  );

  // Match each wanted row to at most one identical existing row.
  const unmatched = new Map<string, ExistingRow[]>();
  for (const r of deletable) {
    const key = `${r.sourceKey ?? ''}|${dayMs(r.date)}`;
    unmatched.set(key, [...(unmatched.get(key) ?? []), r]);
  }
  const keptIds = new Set<string>();
  const create: MaterialRow[] = [];
  for (const w of wanted) {
    const bucket = unmatched.get(`${w.sourceKey}|${dayMs(w.date)}`) ?? [];
    const i = bucket.findIndex((r) => !keptIds.has(r.id) && sameRow(w, r));
    if (i >= 0) keptIds.add(bucket[i].id);
    else create.push(w);
  }

  return {
    deleteIds: deletable.filter((r) => !keptIds.has(r.id)).map((r) => r.id),
    create,
    kept: keptIds.size,
  };
}

/* ------------------------------------------------------------------------ */
/* Where a subscriber is                                                     */
/* ------------------------------------------------------------------------ */

export type Progress =
  | { state: 'unknown' }
  | { state: 'upcoming'; startsInDays: number }
  | { state: 'running'; dayIndex: number; week: number; phaseId: string | null; phaseWeek: number | null }
  | { state: 'finished' };

/**
 * Which day, week and phase of the program a subscriber is on today. Weeks
 * are program weeks (W1 is Day 1-7 from their start), and phaseWeek counts
 * from the phase's own first week, the way "Week 2 of Week 5 - 8" reads.
 */
export function subscriptionProgress(
  startDate: Date | null,
  today: Date,
  ranges: { id: string; startDay: number; endDay: number; startWeek: number }[],
  totalDays: number
): Progress {
  if (!startDate) return { state: 'unknown' };
  const dayIndex = Math.round((dayMs(today) - dayMs(startDate)) / 86_400_000) + 1;
  if (dayIndex < 1) return { state: 'upcoming', startsInDays: 1 - dayIndex };
  if (dayIndex > totalDays) return { state: 'finished' };
  const week = weekOf(dayIndex);
  const phase = phaseForDay(ranges, dayIndex);
  return {
    state: 'running',
    dayIndex,
    week,
    phaseId: phase?.id ?? null,
    phaseWeek: phase ? week - phase.startWeek + 1 : null,
  };
}

/**
 * The real dates each phase covers for a subscriber, and which one is
 * current — the client page's "Training program" view.
 */
export function phaseDates<T extends { id: string; startDay: number; endDay: number }>(
  ranges: T[],
  startDate: Date,
  today: Date
): (T & { from: Date; to: Date; current: boolean; past: boolean })[] {
  const t = dayMs(today);
  return ranges.map((r) => {
    const from = dateForDay(startDate, r.startDay);
    const to = dateForDay(startDate, r.endDay);
    return { ...r, from, to, current: t >= dayMs(from) && t <= dayMs(to), past: t > dayMs(to) };
  });
}
