'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { todayFor } from '@/lib/day';
import { isTracked } from '@/lib/habits';

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
  refresh();
}
