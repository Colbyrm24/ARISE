'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { todayFor } from '@/lib/day';
import { isTracked } from '@/lib/habits';
import { markScheduledDone } from '@/lib/scheduled';
import { displayName, notifyCoach } from '@/lib/notifications';
import { cardioLoggedBody } from '@/lib/activity';

/*
  The client's side of the Today screen.

  Both of these wrote nowhere before. DailyGoalLog and StepLog were read by
  the page and created by nothing, so a habit could be displayed and never
  completed — the checkbox on the busiest screen in the app did not exist.
*/


function refresh() {
  revalidatePath('/today');
}

/**
 * Ticks or unticks a manual habit for today.
 *
 * Tracked habits — steps, protein, calories, the workout — are rejected on
 * purpose. Those complete themselves off a number the app already holds, and
 * allowing a hand-tick would let somebody mark protein done on a day they ate
 * 40g, which turns the whole screen into decoration.
 */
export async function toggleHabit(formData: FormData) {
  const user = await requireClient();
  const goalId = formData.get('goalId') as string | null;
  if (!goalId) return;

  const goal = await prisma.dailyGoal.findUnique({ where: { id: goalId } });
  // Scoped to the caller so a habit id can't be used to tick somebody else's.
  if (!goal || goal.clientId !== user.id || !goal.active) return;
  if (isTracked(goal.goalType)) return;

  const date = todayFor(user);
  const existing = await prisma.dailyGoalLog.findUnique({
    where: { dailyGoalId_date: { dailyGoalId: goalId, date } },
  });

  if (existing) {
    // Untick as well as tick. A habit marked by accident at 7am and left that
    // way all day is worse than no record, because next week's review reads
    // it as done.
    await prisma.dailyGoalLog.update({
      where: { id: existing.id },
      data: { completed: !existing.completed },
    });
  } else {
    await prisma.dailyGoalLog.create({
      data: { clientId: user.id, dailyGoalId: goalId, date, completed: true },
    });
  }
  refresh();
}

/**
 * Logs today's step count.
 *
 * Typed in by hand, because there is no native app and no Health permission to
 * read from. That is worth being plain about rather than dressing up: a number
 * the client copies off their phone once a day is still the number, and it is
 * the difference between a steps habit that can complete and one that cannot.
 */
export async function logSteps(formData: FormData) {
  const user = await requireClient();
  const raw = (formData.get('steps') as string | null)?.trim();
  if (!raw) return;

  const steps = Number(raw);
  if (!Number.isFinite(steps) || steps < 0) return;
  // Nobody walks two hundred thousand steps. A number that large is a typo,
  // and storing it would make every average and chart after it useless.
  const value = Math.round(Math.min(steps, 200000));

  const date = todayFor(user);
  await prisma.stepLog.upsert({
    where: { clientId_date: { clientId: user.id, date } },
    create: { clientId: user.id, date, steps: value, source: 'manual' },
    update: { steps: value, source: 'manual' },
  });

  /*
    A cardio day prescribed in steps is finished by hitting the step target,
    not by filling in a minutes box. Without this only minutes-based cardio
    could ever tick, so the coach's "Cardio 0" header stayed wrong for every
    client whose cardio is a step goal, which is most of them.
  */
  /*
    Only the step-prescribed cardio, now that a day can also carry a swim
    with minutes to log: hitting the step goal ticks the walk, not the swim.
  */
  const stepCardio = await prisma.scheduledItem.findMany({
    where: { clientId: user.id, date, kind: 'cardio', completedAt: null, stepTarget: { not: null } },
    select: { id: true, stepTarget: true },
  });
  const reached = stepCardio.filter((c) => c.stepTarget && value >= c.stepTarget).map((c) => c.id);
  if (reached.length > 0) {
    // Bookkeeping, like markScheduledDone: never an error on the steps form.
    await prisma.scheduledItem
      .updateMany({
        where: { id: { in: reached }, clientId: user.id, completedAt: null },
        data: { completedAt: new Date() },
      })
      .catch(() => undefined);
  }

  refresh();
}

/**
 * Logs a cardio session for today and ticks it off the calendar.
 *
 * CardioLog had no write path anywhere in the app, which made prescribed
 * cardio write-only end to end: the coach put a session on the day, the
 * client was shown a bare label with no number, nothing recorded that they
 * did it, and the coach's month header counted "Cardio 0" no matter what
 * happened. This is the missing half.
 */
export async function logCardio(formData: FormData) {
  const user = await requireClient();

  const cardioTypeId = (formData.get('cardioTypeId') as string | null)?.trim();
  const raw = (formData.get('minutes') as string | null)?.trim();
  if (!cardioTypeId || !raw) return;

  const minutes = Number(raw);
  // A session is minutes, not hours. Anything past a few hours is a typo, and
  // it would drag every average after it.
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) return;

  // The type has to be one the coach actually put on this client's calendar,
  // rather than any id that arrives in the form.
  const date = todayFor(user);
  const scheduled = await prisma.scheduledItem.findFirst({
    where: { clientId: user.id, date, kind: 'cardio', cardioTypeId },
    select: { id: true },
  });
  if (!scheduled) return;

  /*
    One cardio log per type per day, so logging again corrects the number
    rather than stacking a second session on the first.

    A real upsert against a unique index, not findFirst-then-create: two
    submits a moment apart — a double tap on a slow connection — would both
    miss the read and both insert, and the screen reads with findFirst so
    the duplicate would be invisible to the client and to the coach.
  */
  /*
    Whether this is the first log of the day decides whether the coach hears
    about it. Correcting 30 minutes to 35 is not a second session, and a feed
    that says otherwise trains people to ignore it.
  */
  const already = await prisma.cardioLog.findUnique({
    where: { clientId_cardioTypeId_date: { clientId: user.id, cardioTypeId, date } },
    select: { id: true },
  });

  await prisma.cardioLog.upsert({
    where: { clientId_cardioTypeId_date: { clientId: user.id, cardioTypeId, date } },
    create: { clientId: user.id, cardioTypeId, date, minutes },
    update: { minutes },
  });

  await markScheduledDone(user.id, 'cardio', { day: date, cardioTypeId });

  if (!already) {
    const [name, type] = await Promise.all([
      displayName(user.id),
      prisma.cardioType.findUnique({ where: { id: cardioTypeId }, select: { name: true } }),
    ]);
    await notifyCoach(user.id, 'activity', cardioLoggedBody(name, type?.name, minutes));
  }

  refresh();
}

/**
 * Ticks one of today's items off by hand: a photo, body-stats or check-in
 * reminder, or cardio prescribed as written text ("swim, 1 km easy") that has
 * no minutes to log.
 *
 * Scoped to the caller, to today, and to those kinds. A lift is finished by
 * finishing the session, and minutes-based cardio by logging it — letting
 * either be hand-ticked would put a done chip on the coach's calendar for a
 * session with no record behind it.
 */
export async function markItemDone(formData: FormData) {
  const user = await requireClient();
  const itemId = formData.get('itemId') as string | null;
  if (!itemId) return;

  await prisma.scheduledItem.updateMany({
    where: {
      id: itemId,
      clientId: user.id,
      date: todayFor(user),
      completedAt: null,
      OR: [
        { kind: { in: ['photos', 'bodystats', 'checkin'] } },
        { kind: 'cardio', cardioMinutes: null },
        { kind: 'cardio', cardioTypeId: null },
      ],
    },
    data: { completedAt: new Date() },
  });

  refresh();
  revalidatePath('/calendar');
}
