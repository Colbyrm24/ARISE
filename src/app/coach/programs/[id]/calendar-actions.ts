'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { coachOwnsTemplate } from '@/lib/coach-guard';
import {
  cleanItemInput,
  copyWeek,
  expandRepeat,
  isValidDay,
  phaseForDay,
  phaseRanges,
  programWeeks,
  stampPattern,
  MAX_DAY,
  type ItemFields,
  type ItemInput,
  type PatternEntry,
} from '@/lib/program-calendar';
import { readPhases } from '@/lib/program-phases';
import { resyncTemplate } from '@/lib/program-subscribers';

/*
  The program calendar's edits, as server actions.

  Called straight from the calendar component with plain arguments, the way
  the client calendar's actions are. Every one proves the coach owns the
  template first, and every id that arrives alongside it — a calendar item, a
  workout, a cardio type — is checked against that template (or that coach)
  rather than trusted: an item id is only ever matched together with its
  templateId, so one coach's item can't be edited through another's program.
*/

export type CalendarResult = { ok: boolean; message?: string };

type Guarded = { coachId: string; templateCoachId: string };

async function guard(templateId: string): Promise<Guarded | null> {
  const coach = await requireCoach();
  if (!templateId || !(await coachOwnsTemplate(coach.id, templateId))) return null;
  const template = await prisma.workoutTemplate.findUnique({
    where: { id: templateId },
    select: { coachId: true },
  });
  if (!template) return null;
  return { coachId: coach.id, templateCoachId: template.coachId };
}

const DENIED: CalendarResult = { ok: false, message: 'That program is not yours.' };

/*
  Every edit here changes what lands on a calendar, so every successful one
  ends here: subscribers' future days follow the master, then the page
  re-renders. Awaited rather than fired off, so a coach who opens a client's
  calendar right after an edit already sees it.
*/
async function refresh(templateId: string) {
  await resyncTemplate(templateId);
  revalidatePath(`/coach/programs/${templateId}`);
}

/**
 * The workout must be in this program and the cardio type must be the
 * program owner's. Anything else would deploy a session the client's workout
 * screen refuses to open, or another coach's cardio label.
 */
async function checkRefs(templateId: string, g: Guarded, f: ItemFields): Promise<string | null> {
  if (f.workoutId) {
    const w = await prisma.workout.findFirst({ where: { id: f.workoutId, templateId }, select: { id: true } });
    if (!w) return "That workout isn't in this program.";
  }
  if (f.cardioTypeId) {
    const c = await prisma.cardioType.findFirst({
      where: { id: f.cardioTypeId, coachId: g.templateCoachId },
      select: { id: true },
    });
    if (!c) return "That cardio type isn't one of yours.";
  }
  return null;
}

async function run(fn: () => Promise<CalendarResult>): Promise<CalendarResult> {
  try {
    return await fn();
  } catch (err) {
    console.error('Program calendar edit failed', { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, message: 'That did not save. Try again.' };
  }
}

export type RepeatInput = {
  /** Positions in the program week, 1..7. Empty = no repeat. */
  weekdays: number[];
  /** "for N weeks" — ignored when toPhaseEnd is set. */
  weeks?: number;
  toPhaseEnd?: boolean;
};

/** Add Activity: one item on one day, or a weekly repeat of it. */
export async function addCalendarItems(
  templateId: string,
  dayIndex: number,
  input: ItemInput,
  repeat?: RepeatInput | null
): Promise<CalendarResult> {
  return run(async () => {
    const g = await guard(templateId);
    if (!g) return DENIED;
    if (!isValidDay(dayIndex)) return { ok: false, message: 'Pick a day in the program.' };

    const clean = cleanItemInput(input);
    if (!clean.ok) return { ok: false, message: clean.reason };
    const bad = await checkRefs(templateId, g, clean.fields);
    if (bad) return { ok: false, message: bad };

    let days = [dayIndex];
    if (repeat && repeat.weekdays.length > 0) {
      let untilDay: number | undefined;
      if (repeat.toPhaseEnd) {
        const phases = await readPhases(templateId);
        untilDay = phaseForDay(phaseRanges(phases), dayIndex)?.endDay ?? dayIndex;
      }
      days = expandRepeat({ dayIndex, weekdays: repeat.weekdays, weeks: repeat.weeks, untilDay });
    }
    if (days.length === 0) return { ok: false, message: 'That repeat lands on no days.' };

    // New items go after whatever each day already holds.
    const existing = await prisma.programCalendarItem.groupBy({
      by: ['dayIndex'],
      where: { templateId, dayIndex: { in: days } },
      _count: { _all: true },
    });
    const countOn = new Map<number, number>(
      existing.map((r: { dayIndex: number; _count: { _all: number } }) => [r.dayIndex, r._count._all])
    );

    await prisma.programCalendarItem.createMany({
      data: days.map((d) => ({ ...clean.fields, templateId, dayIndex: d, position: countOn.get(d) ?? 0 })),
    });
    await refresh(templateId);
    return { ok: true, message: days.length === 1 ? 'Added.' : `Added to ${days.length} days.` };
  });
}

/** Edit one item in place — its details and, optionally, its day. */
export async function updateCalendarItem(
  templateId: string,
  itemId: string,
  dayIndex: number,
  input: ItemInput
): Promise<CalendarResult> {
  return run(async () => {
    const g = await guard(templateId);
    if (!g) return DENIED;
    if (!isValidDay(dayIndex)) return { ok: false, message: 'Pick a day in the program.' };

    const clean = cleanItemInput(input);
    if (!clean.ok) return { ok: false, message: clean.reason };
    const bad = await checkRefs(templateId, g, clean.fields);
    if (bad) return { ok: false, message: bad };

    const updated = await prisma.programCalendarItem.updateMany({
      where: { id: itemId, templateId },
      data: { ...clean.fields, dayIndex },
    });
    if (updated.count === 0) return { ok: false, message: 'That item is no longer on the calendar.' };
    await refresh(templateId);
    return { ok: true, message: 'Saved.' };
  });
}

export async function deleteCalendarItem(templateId: string, itemId: string): Promise<CalendarResult> {
  return run(async () => {
    const g = await guard(templateId);
    if (!g) return DENIED;
    await prisma.programCalendarItem.deleteMany({ where: { id: itemId, templateId } });
    await refresh(templateId);
    return { ok: true, message: 'Removed.' };
  });
}

/**
 * Drag an item to another day. A plain move — a program day can hold
 * several things, so nothing on the target day is displaced.
 */
export async function moveCalendarItem(templateId: string, itemId: string, dayIndex: number): Promise<CalendarResult> {
  return run(async () => {
    const g = await guard(templateId);
    if (!g) return DENIED;
    if (!isValidDay(dayIndex)) return { ok: false, message: 'That day is outside the program.' };
    const moved = await prisma.programCalendarItem.updateMany({
      where: { id: itemId, templateId },
      data: { dayIndex },
    });
    if (moved.count === 0) return { ok: false, message: 'That item is no longer on the calendar.' };
    await refresh(templateId);
    return { ok: true };
  });
}

/**
 * Copy one week onto others. With `replace`, what was on the target weeks is
 * cleared first, so copying week 1 over weeks 2–4 gives four identical weeks
 * rather than stacking a second lift on every day.
 */
export async function copyCalendarWeek(
  templateId: string,
  fromWeek: number,
  toWeeks: number[],
  replace: boolean
): Promise<CalendarResult> {
  return run(async () => {
    const g = await guard(templateId);
    if (!g) return DENIED;

    const items = await prisma.programCalendarItem.findMany({ where: { templateId } });
    const rows = copyWeek(items, fromWeek, toWeeks);
    const targets = [...new Set(toWeeks)].filter((w) => w !== fromWeek && w >= 1 && w * 7 <= MAX_DAY);
    if (targets.length === 0) return { ok: false, message: 'Pick at least one other week.' };

    await prisma.$transaction([
      ...(replace
        ? targets.map((w) =>
            prisma.programCalendarItem.deleteMany({
              where: { templateId, dayIndex: { gte: (w - 1) * 7 + 1, lte: w * 7 } },
            })
          )
        : []),
      prisma.programCalendarItem.createMany({ data: rows.map((r) => ({ ...r, templateId })) }),
    ]);
    await refresh(templateId);
    return {
      ok: true,
      message: `Week ${fromWeek} copied to ${targets.length} week${targets.length === 1 ? '' : 's'}.`,
    };
  });
}

/**
 * "Fill from a weekly pattern": a seven-slot week stamped across one phase.
 * The fast path for the common program — the same week, every week — and
 * how a template built on the old repeating week moves onto the calendar.
 */
export async function fillFromPattern(
  templateId: string,
  phaseId: string,
  pattern: PatternEntry[][],
  replace: boolean
): Promise<CalendarResult> {
  return run(async () => {
    const g = await guard(templateId);
    if (!g) return DENIED;

    const items = await prisma.programCalendarItem.findMany({ where: { templateId }, select: { dayIndex: true } });
    const phases = await readPhases(templateId, items);
    const range = phaseRanges(phases).find((r) => r.id === phaseId);
    if (!range) return { ok: false, message: 'That phase is not in this program.' };

    // Every slot entry goes through the same cleaning and ownership checks
    // as a single Add Activity.
    const slots: PatternEntry[][] = [];
    for (let i = 0; i < 7; i += 1) {
      const out: PatternEntry[] = [];
      for (const e of pattern[i] ?? []) {
        const clean = cleanItemInput(e);
        if (!clean.ok) continue;
        const bad = await checkRefs(templateId, g, clean.fields);
        if (bad) return { ok: false, message: bad };
        out.push(clean.fields);
      }
      slots.push(out);
    }

    const rows = stampPattern(slots, range);
    if (rows.length === 0) return { ok: false, message: 'The pattern is empty — fill in at least one day.' };

    await prisma.$transaction([
      ...(replace
        ? [
            prisma.programCalendarItem.deleteMany({
              where: { templateId, dayIndex: { gte: range.startDay, lte: range.endDay } },
            }),
          ]
        : []),
      prisma.programCalendarItem.createMany({ data: rows.map((r) => ({ ...r, templateId })) }),
    ]);
    await refresh(templateId);
    const weeks = programWeeks([{ id: range.id, weeks: (range.endDay - range.startDay + 1) / 7 }], []);
    return { ok: true, message: `Filled ${weeks} week${weeks === 1 ? '' : 's'} — ${rows.length} items.` };
  });
}
