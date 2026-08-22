import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';

/*
  Turning a week into months.

  The whole point of the program screen is that a coach describes seven days
  once and then stops thinking about the calendar. This is the part that does
  the stamping: read the template's week, walk forward day by day from the
  start date, and write one dated row per day onto the client's calendar.

  Two decisions worth knowing about:

  - Rows are COPIED, not linked. A scheduled day carries its own label, step
    target and cardio minutes rather than reading them back off the template.
    That means editing the program in March cannot rewrite what someone was
    asked to do in January, and one client's Tuesday can be changed without
    touching anybody else's.

  - A deploy owns its rows through batchId. Re-deploying clears only the rows
    its own template put there and only from the start date forward, so a day
    the coach dragged around by hand, and everything already in the past,
    survives.
*/

/** Dates only, at UTC midnight — this calendar has no notion of time of day. */
function dateOnly(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/**
 * ISO weekday: 1 = Monday .. 7 = Sunday.
 *
 * JS getUTCDay() is Sunday-first and returns 0 for Sunday, which is the
 * single most common off-by-one in scheduling code — a program that starts on
 * a Sunday silently lands a whole week wrong. Converted once, here.
 */
export function isoWeekday(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

export type DeployOptions = {
  clientId: string;
  templateId: string;
  /** First day of the program. Anything earlier on the calendar is left alone. */
  startDate: Date;
  weeks: number;
};

export type DeployResult = {
  created: number;
  removed: number;
  from: Date;
  to: Date;
  batchId: string;
  restDays: number;
  workoutDays: number;
};

/** Six months. The default because it is what a coaching block actually is. */
export const DEFAULT_WEEKS = 26;
export const MAX_WEEKS = 52;

export async function deployProgram({
  clientId,
  templateId,
  startDate,
  weeks,
}: DeployOptions): Promise<DeployResult> {
  const span = Math.max(1, Math.min(Math.round(weeks) || DEFAULT_WEEKS, MAX_WEEKS));
  const from = dateOnly(startDate);
  const to = addDays(from, span * 7 - 1);

  const days = await prisma.programDay.findMany({
    where: { templateId },
    include: { workout: { select: { id: true, name: true } } },
  });
  if (days.length === 0) {
    return { created: 0, removed: 0, from, to, batchId: '', restDays: 0, workoutDays: 0 };
  }

  const byWeekday = new Map(days.map((d) => [d.weekday, d]));
  const batchId = randomUUID();

  // Clear what a previous deploy of THIS template put on THIS client's
  // calendar from the start date forward. Hand-placed rows have no
  // templateId, and the past is never touched.
  const removed = await prisma.scheduledItem.deleteMany({
    where: { clientId, templateId, date: { gte: from } },
  });

  const rows: {
    id: string;
    clientId: string;
    date: Date;
    kind: string;
    label: string;
    workoutId: string | null;
    cardioTypeId: string | null;
    cardioMinutes: number | null;
    stepTarget: number | null;
    batchId: string;
    templateId: string;
  }[] = [];

  let restDays = 0;
  let workoutDays = 0;

  for (let i = 0; i < span * 7; i += 1) {
    const date = addDays(from, i);
    const day = byWeekday.get(isoWeekday(date));
    // A week with a weekday left blank simply has nothing on that day — that
    // is a legitimate way to describe a program, not an error.
    if (!day) continue;

    const label = day.workout?.name ?? day.label ?? (day.kind === 'rest' ? 'Rest day' : 'Cardio');
    if (day.kind === 'rest') restDays += 1;
    if (day.kind === 'workout') workoutDays += 1;

    rows.push({
      id: randomUUID(),
      clientId,
      date,
      kind: day.kind,
      label,
      workoutId: day.workoutId,
      cardioTypeId: day.cardioTypeId,
      cardioMinutes: day.cardioMinutes,
      stepTarget: day.stepTarget,
      batchId,
      templateId,
    });
  }

  // One statement rather than 180. A six-month deploy is ~182 rows and this
  // is the difference between the button feeling instant and feeling broken.
  if (rows.length > 0) {
    await prisma.scheduledItem.createMany({ data: rows, skipDuplicates: true });
  }

  return {
    created: rows.length,
    removed: removed.count,
    from,
    to,
    batchId,
    restDays,
    workoutDays,
  };
}

/** Everything on a client's calendar between two dates, in order. */
export async function scheduleBetween(clientId: string, from: Date, to: Date) {
  return prisma.scheduledItem.findMany({
    where: { clientId, date: { gte: dateOnly(from), lte: dateOnly(to) } },
    orderBy: [{ date: 'asc' }, { kind: 'asc' }],
    include: {
      workout: { select: { id: true, name: true, estMinutes: true } },
      cardioType: { select: { id: true, name: true, unit: true } },
    },
  });
}

/** What a client is meant to do today. Null when the calendar is empty. */
export async function scheduledToday(clientId: string, now = new Date()) {
  const today = dateOnly(now);
  return prisma.scheduledItem.findFirst({
    where: { clientId, date: today },
    include: {
      workout: { select: { id: true, name: true, estMinutes: true } },
      cardioType: { select: { id: true, name: true, unit: true } },
    },
  });
}

export { dateOnly, addDays };
