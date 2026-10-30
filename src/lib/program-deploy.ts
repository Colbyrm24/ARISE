import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { pickPrimary } from '@/lib/schedule-move';
import { implicitPhase, isRestDay, materialize, orderDayItems, programWeeks } from '@/lib/program-calendar';

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

export async function deployProgram(opts: DeployOptions): Promise<DeployResult> {
  /*
    A program built on the Day-N calendar deploys from that; one that only
    has the old repeating week deploys exactly as it always did. Checked per
    deploy rather than flagged on the template, so the moment a coach puts the
    first item on a calendar that is the program — and Follow My Split, the
    client page's Start program and every existing template, none of which
    have calendar items, never notice this branch exists.
  */
  const calendarCount = await prisma.programCalendarItem.count({ where: { templateId: opts.templateId } });
  if (calendarCount > 0) return deployCalendar(opts);
  return deployWeek(opts);
}

/** The original deploy: one repeating Mon–Sun week stamped across N weeks. */
async function deployWeek({
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

  /*
    Clear what ANY previous deploy put on this client's calendar from the
    start date forward — not just this template's.

    It used to filter on `templateId`, which is right only while a client
    never changes program. Deploy Phase 2 in April over a January block that
    runs to July and the January rows stay: from April to July the client has
    TWO rows on every date, and there is no unique constraint on
    ScheduledItem, so skipDuplicates cannot catch it either. scheduledToday
    is a findFirst with no ordering, so which program they see becomes
    whichever row Postgres hands back; the coach's month view draws two chips
    a day and counts "6/44" in a month with 22 sessions; markScheduledDone
    updateManys both; and the confirmation says "Replaced 0 from the previous
    deploy" while it happens. No screen in the app could clear the orphans.

    Hand-placed rows still survive — they have no templateId — and the past is
    still never touched. Completed sessions survive too: re-deploying at 6pm
    used to delete the row the client ticked that morning, which un-did their
    own tick and dropped the month's count by one. A finished day is a record
    of something that happened, not a plan to be replaced.
  */
  const removed = await prisma.scheduledItem.deleteMany({
    where: {
      clientId,
      templateId: { not: null },
      completedAt: null,
      date: { gte: from },
    },
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

/**
 * Deploy from the program calendar: every item on Day N lands on
 * startDate + N - 1, several to a day where the coach put several, each row
 * carrying the sourceKey of the item that wrote it.
 *
 * The program runs its own length — the sum of its phases — rather than the
 * `weeks` asked for: a 12-week program is 12 weeks, and stretching it to 26
 * would mean inventing 14 weeks the coach never wrote. Callers that keep a
 * calendar topped up (Follow My Split) deploy again from the day after the
 * last row, which runs the program from Day 1 again.
 *
 * Clearing is identical to the week deploy, for the same reasons: anything a
 * deploy wrote from the start date on, unless it is finished.
 */
async function deployCalendar({ clientId, templateId, startDate }: DeployOptions): Promise<DeployResult> {
  const from = dateOnly(startDate);

  const [items, phases, client] = await Promise.all([
    prisma.programCalendarItem.findMany({
      where: { templateId },
      include: {
        workout: { select: { name: true } },
        cardioType: { select: { name: true } },
      },
    }),
    prisma.programPhase.findMany({ where: { templateId }, orderBy: { position: 'asc' }, select: { id: true, weeks: true } }),
    prisma.client.findUnique({ where: { userId: clientId }, select: { tier: true } }),
  ]);

  const span = Math.min(
    MAX_WEEKS,
    programWeeks(phases.length > 0 ? phases : [implicitPhase(items)], items)
  );
  const to = addDays(from, span * 7 - 1);

  /*
    Message items are coach messages delivered on their day. Only 1-on-1
    clients have a message thread — a Follow My Split member has no coach
    inbox, and the automatic messages skip them for the same reason — so for
    anyone else those items are simply not written.
  */
  const skipKinds = client?.tier === 'coaching' ? [] : ['message'];
  const material = materialize(items, from, span * 7, { skipKinds });

  const removed = await prisma.scheduledItem.deleteMany({
    where: {
      clientId,
      templateId: { not: null },
      completedAt: null,
      date: { gte: from },
    },
  });

  const batchId = randomUUID();
  const rows = material.map((m) => ({
    id: randomUUID(),
    clientId,
    date: m.date,
    kind: m.kind,
    label: m.label,
    workoutId: m.workoutId,
    cardioTypeId: m.cardioTypeId,
    cardioMinutes: m.cardioMinutes,
    cardioTarget: m.cardioTarget,
    stepTarget: m.stepTarget,
    note: m.note,
    sourceKey: m.sourceKey,
    batchId,
    templateId,
  }));

  if (rows.length > 0) {
    await prisma.scheduledItem.createMany({ data: rows, skipDuplicates: true });
  }

  // Counted in days, the way the week deploy's confirmation reads: a day
  // with a lift and a swim is one session day, not two.
  const dayKinds = new Map<string, string[]>();
  for (const r of rows) {
    const k = r.date.toISOString().slice(0, 10);
    dayKinds.set(k, [...(dayKinds.get(k) ?? []), r.kind]);
  }
  let restDays = 0;
  let workoutDays = 0;
  for (const kinds of dayKinds.values()) {
    if (kinds.includes('workout')) workoutDays += 1;
    else if (isRestDay(kinds)) restDays += 1;
  }

  return { created: rows.length, removed: removed.count, from, to, batchId, restDays, workoutDays };
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

/**
 * Everything on a client's day, in the order Today reads it: the lift, each
 * cardio, reminders, then rest. `message` rows are left out — they arrive in
 * the client's messages on the day, and showing one in advance would spoil it.
 */
export async function scheduledDay(clientId: string, day: Date) {
  const items = await prisma.scheduledItem.findMany({
    where: { clientId, date: day, kind: { not: 'message' } },
    include: {
      workout: { select: { id: true, name: true, estMinutes: true } },
      cardioType: { select: { id: true, name: true, unit: true } },
    },
  });
  return orderDayItems(items);
}

/** What a client is meant to do today. Null when the calendar is empty. */
export async function scheduledToday(clientId: string, today: Date) {
  /*
    `today` is passed in rather than computed, and it must be the client's own
    calendar day. This used to default to `dateOnly(new Date())` — UTC on the
    server — so from early evening onward a client west of Greenwich was shown
    tomorrow's session, or a rest day on a day they were meant to train.
  */
  const items = await prisma.scheduledItem.findMany({
    where: { clientId, date: today },
    include: {
      workout: { select: { id: true, name: true, estMinutes: true } },
      cardioType: { select: { id: true, name: true, unit: true } },
    },
  });
  /*
    A day should hold one session, but a coach moving a session onto a day the
    client already finished can leave two. This was a findFirst with no
    ordering, so which one the client saw was up to Postgres — and "Rest day"
    winning on a training day is the worst answer. pickPrimary decides.
  */
  return pickPrimary(items);
}

export { dateOnly, addDays };

/**
 * Make this the client's one active program.
 *
 * Two paths used to do this differently and neither was safe. Assigning from
 * the client page deactivated everything and then always CREATED a row, so
 * re-assigning the same program four times left four rows. Deploying from the
 * builder upserted on a synthetic `"clientId:templateId"` id that the other
 * path never writes — so a program assigned first and deployed second ended
 * up with two rows, both active, and which one won a `findFirst` was up to
 * Postgres.
 *
 * There is now a unique constraint on (clientId, templateId), so the row is
 * keyed rather than found. That is the part the transaction could not do on
 * its own: Postgres reads committed, so two concurrent calls both saw no row
 * and both created one — and this function is called from two places, the
 * client page and the program builder's deploy, which is exactly how they
 * overlapped. The client ended up with two active programs and the Today
 * screen picked one of them arbitrarily.
 *
 * Deactivating everything first and reactivating exactly one still collapses
 * any duplicates an earlier deploy already left behind.
 */
export async function setActiveProgram(clientId: string, templateId: string, startDate?: Date) {
  /*
    With a start date, this is a (re)subscription: the deploy just wrote Day 1
    onto that date, so the subscription records it and is linked to the
    master again. Without one — a Follow My Split top-up re-asserting the
    program — the start date and the linked choice the coach made are kept.
  */
  const start = startDate ? { startDate: dateOnly(startDate), linked: true } : {};
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.clientProgram.updateMany({
      where: { clientId, active: true },
      data: { active: false },
    });

    await tx.clientProgram.upsert({
      where: { clientId_templateId: { clientId, templateId } },
      create: { clientId, templateId, active: true, ...start },
      update: { active: true, ...start },
    });
  });
}
