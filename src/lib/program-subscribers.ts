import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { todayIn, zoneOf } from '@/lib/day';
import { implicitPhase, MAX_PROGRAM_WEEKS, programWeeks } from '@/lib/program-calendar';
import { planSync, type ExistingRow, type SyncPlan } from '@/lib/program-sync';
import { deployProgram, setActiveProgram, DEFAULT_WEEKS, type DeployResult } from '@/lib/program-deploy';

/*
  A program's subscribers: who is on it, and keeping their calendars in step
  with it.

  A subscription is the ClientProgram row — active, with the start date Day 1
  landed on and whether it is still linked to the master. Adding a
  subscriber is the same deploy every other path uses, so Follow My Split,
  Start program on the client page and Add subscribers all leave a client in
  the same state.

  The sync itself is decided by planSync (program-sync.ts); this file only
  loads what it needs and applies the result, one deleteMany and one
  createMany per subscriber in a transaction. The delete re-checks
  "unfinished and unpinned" in its own WHERE, so a session the client ticks
  between the read and the write is never deleted from under them.
*/

const ROW_SELECT = {
  id: true,
  clientId: true,
  date: true,
  kind: true,
  label: true,
  workoutId: true,
  cardioTypeId: true,
  cardioMinutes: true,
  cardioTarget: true,
  stepTarget: true,
  note: true,
  sourceKey: true,
  completedAt: true,
  pinned: true,
} as const;

type LoadedRow = {
  id: string;
  clientId: string;
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
  completedAt: Date | null;
  pinned: boolean;
};

function toExisting(r: LoadedRow): ExistingRow {
  return {
    id: r.id,
    date: r.date,
    kind: r.kind,
    label: r.label,
    workoutId: r.workoutId,
    cardioTypeId: r.cardioTypeId,
    cardioMinutes: r.cardioMinutes,
    cardioTarget: r.cardioTarget,
    stepTarget: r.stepTarget,
    note: r.note,
    sourceKey: r.sourceKey,
    completed: r.completedAt !== null,
    pinned: r.pinned,
  };
}

/** The master's calendar and length, read once per resync. */
async function loadMaster(templateId: string) {
  const [items, phases] = await Promise.all([
    prisma.programCalendarItem.findMany({
      where: { templateId },
      include: { workout: { select: { name: true } }, cardioType: { select: { name: true } } },
    }),
    prisma.programPhase.findMany({ where: { templateId }, orderBy: { position: 'asc' }, select: { id: true, weeks: true } }),
  ]);
  // The same length deployCalendar writes, so a sync and a deploy agree on
  // where the program ends.
  const weeks = Math.min(MAX_PROGRAM_WEEKS, programWeeks(phases.length > 0 ? phases : [implicitPhase(items)], items));
  return { items, totalDays: weeks * 7 };
}

type Subscription = {
  clientId: string;
  startDate: Date | null;
  skippedKeys: string[];
  client: { tier: string; user: { profile: { timezone: string | null } | null } };
};

async function applyPlan(clientId: string, templateId: string, plan: SyncPlan) {
  if (plan.deleteIds.length === 0 && plan.create.length === 0) return;
  const batchId = randomUUID();
  await prisma.$transaction([
    prisma.scheduledItem.deleteMany({
      where: { id: { in: plan.deleteIds }, clientId, templateId, completedAt: null, pinned: false },
    }),
    prisma.scheduledItem.createMany({
      data: plan.create.map((m) => ({
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
      })),
    }),
  ]);
}

function planFor(
  sub: Subscription & { startDate: Date },
  master: Awaited<ReturnType<typeof loadMaster>>,
  rows: LoadedRow[],
  through?: Date
) {
  return planSync({
    startDate: sub.startDate,
    // Each client's own today: a sync at 9pm Eastern must not treat a
    // client in London's already-started tomorrow as the future.
    today: todayIn(zoneOf(sub.client.user.profile)),
    items: master.items,
    totalDays: master.totalDays,
    // Same rule as the deploy: only 1-on-1 clients have a message thread.
    skipKinds: sub.client.tier === 'coaching' ? [] : ['message'],
    // Follow My Split calendars are topped up past the program's end.
    repeats: sub.client.tier === 'program',
    existing: rows.map(toExisting),
    through,
    skippedKeys: sub.skippedKeys,
  });
}

export type ResyncResult = { subscribers: number; synced: number; skipped: number; failed: number };

/**
 * Brings every linked subscriber of a template in line with it. Called after
 * every master edit that changes what lands on a calendar.
 *
 * Never throws: the coach's edit has already been saved by the time this
 * runs, and one client's failure must not stop the rest — or make the edit
 * look like it failed.
 */
export async function resyncTemplate(templateId: string): Promise<ResyncResult> {
  const result: ResyncResult = { subscribers: 0, synced: 0, skipped: 0, failed: 0 };
  try {
    const subs: Subscription[] = await prisma.clientProgram.findMany({
      where: { templateId, active: true, linked: true, startDate: { not: null } },
      select: {
        clientId: true,
        startDate: true,
        skippedKeys: true,
        client: { select: { tier: true, user: { select: { profile: { select: { timezone: true } } } } } },
      },
    });
    result.subscribers = subs.length;
    if (subs.length === 0) return result;

    const master = await loadMaster(templateId);
    // One read for every subscriber's rows of this template.
    const rows: LoadedRow[] = await prisma.scheduledItem.findMany({
      where: { templateId, clientId: { in: subs.map((s) => s.clientId) } },
      select: ROW_SELECT,
    });
    const byClient = new Map<string, LoadedRow[]>();
    for (const r of rows) byClient.set(r.clientId, [...(byClient.get(r.clientId) ?? []), r]);

    for (const sub of subs) {
      if (!sub.startDate) continue;
      try {
        const plan = planFor({ ...sub, startDate: sub.startDate }, master, byClient.get(sub.clientId) ?? []);
        if (plan.skipped) {
          result.skipped += 1;
          continue;
        }
        await applyPlan(sub.clientId, templateId, plan);
        result.synced += 1;
      } catch (err) {
        result.failed += 1;
        console.error('Program resync failed for a subscriber', {
          templateId,
          clientId: sub.clientId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('Program resync failed', { templateId, error: err instanceof Error ? err.message : String(err) });
  }
  return result;
}

/**
 * Extends one linked subscriber's calendar through `through` by running the
 * program again — the Follow My Split top-up for a calendar program, so the
 * repeat lines up with their start date and carries proper cycle keys
 * instead of restarting Day 1 wherever the last row happened to fall.
 * False when the subscription can't be synced; the caller falls back to the
 * plain deploy.
 */
export async function extendSubscription(clientId: string, templateId: string, through: Date): Promise<boolean> {
  const sub = await prisma.clientProgram.findFirst({
    where: { clientId, templateId, active: true, linked: true, startDate: { not: null } },
    select: {
      clientId: true,
      startDate: true,
      skippedKeys: true,
      client: { select: { tier: true, user: { select: { profile: { select: { timezone: true } } } } } },
    },
  });
  if (!sub?.startDate) return false;
  const calendar = await prisma.programCalendarItem.count({ where: { templateId } });
  if (calendar === 0) return false;

  const master = await loadMaster(templateId);
  const rows: LoadedRow[] = await prisma.scheduledItem.findMany({
    where: { templateId, clientId },
    select: ROW_SELECT,
  });
  const plan = planFor({ ...sub, startDate: sub.startDate }, master, rows, through);
  if (plan.skipped) return false;
  await applyPlan(clientId, templateId, plan);
  return true;
}

/**
 * Puts a client on a program from a start date and records the
 * subscription. Deploying replaces every unfinished program row from the
 * start date on, whichever program wrote it, and the client's other
 * programs are retired — a client follows one program at a time.
 */
export async function subscribeClient(
  clientId: string,
  templateId: string,
  startDate: Date,
  weeks: number = DEFAULT_WEEKS
): Promise<DeployResult> {
  const result = await deployProgram({ clientId, templateId, startDate, weeks });
  if (result.created > 0) await setActiveProgram(clientId, templateId, startDate);
  return result;
}

/**
 * Takes a client off a program: their future, unfinished, unpinned days from
 * it go, and the subscription is retired. The past, anything they finished
 * and anything the coach placed by hand stay — those are their record, not
 * the program's plan.
 */
export async function removeSubscription(clientId: string, templateId: string) {
  const who = await prisma.user.findUnique({
    where: { id: clientId },
    select: { profile: { select: { timezone: true } } },
  });
  const today = todayIn(zoneOf(who?.profile));
  const [removed] = await prisma.$transaction([
    prisma.scheduledItem.deleteMany({
      where: { clientId, templateId, completedAt: null, pinned: false, date: { gte: today } },
    }),
    prisma.clientProgram.updateMany({ where: { clientId, templateId }, data: { active: false } }),
  ]);
  return removed.count;
}

/** Keeps the client's rows and stops them following the master. */
export async function setLinked(clientId: string, templateId: string, linked: boolean) {
  await prisma.clientProgram.updateMany({ where: { clientId, templateId, active: true }, data: { linked } });
}
